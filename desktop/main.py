"""Questleaf for Windows: opens the app (web/) in a native window with pywebview and keeps the save in
%APPDATA%\\Questleaf. Run it with python desktop\\main.py [--debug]; build the .exe with build.bat."""
import base64
import datetime
import glob
import json
import os
import shutil
import socket
import sys
import threading
import zlib
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import webview

APP_TITLE = 'Questleaf'
APP_ID = 'Questleaf'  # folder, registry and file names
APPDATA = os.environ.get('APPDATA') or os.path.expanduser('~')


def _env(name):
    """Test folders come from environment variables (QUESTLEAF_DATA, QUESTLEAF_BACKUPS, QUESTLEAF_MUSIC)."""
    return os.environ.get(f'QUESTLEAF_{name}')


# Environment variables let tests use their own folders without touching the real save
DATA_DIR = _env('DATA') or os.path.join(APPDATA, APP_ID)
DATA_FILE = os.path.join(DATA_DIR, 'save.json')


INSTANCE_PORT = 42400 + zlib.crc32(DATA_DIR.lower().encode('utf-8')) % 500


def documents_dir():
    """The user's real Documents folder (even when it was moved to OneDrive)."""
    try:
        import ctypes
        buf = ctypes.create_unicode_buffer(260)
        if ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, buf) == 0 and buf.value:  # 5 = Documents
            return buf.value
    except Exception:
        pass
    return os.path.join(os.path.expanduser('~'), 'Documents')


# Profiles: each person has their own save. The usual one (save.json) is the 'main' profile.
MAIN_PROFILE = 'main'
MAIN_PROFILE_ALIAS = 'principal'  # the same profile under its Spanish id
PROFILES_FILE = os.path.join(DATA_DIR, 'profiles.json')
_PROF_LOCK = threading.RLock()  # pywebview calls the API from several threads at once


def _profiles():
    try:
        with open(PROFILES_FILE, encoding='utf-8') as f:
            reg = json.load(f)
    except (OSError, ValueError):
        reg = None
    if not isinstance(reg, dict) or not isinstance(reg.get('list'), list) or not reg['list']:
        reg = {'active': MAIN_PROFILE, 'list': [{'id': MAIN_PROFILE, 'name': ''}]}
    for p in reg['list']:
        if p.get('id') == MAIN_PROFILE_ALIAS:
            p['id'] = MAIN_PROFILE
    if reg.get('active') == MAIN_PROFILE_ALIAS:
        reg['active'] = MAIN_PROFILE
    if not any(p.get('id') == reg.get('active') for p in reg['list']):
        reg['active'] = reg['list'][0]['id']
    return reg


def _save_profiles(reg):
    with _PROF_LOCK:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = PROFILES_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(reg, f, ensure_ascii=False)
        os.replace(tmp, PROFILES_FILE)


def profile_file(pid):
    return DATA_FILE if pid == MAIN_PROFILE else os.path.join(DATA_DIR, f'profile-{pid}.json')


# App-wide preferences shared by every profile (e.g. the interface language).
# Only whitelisted keys and values can be stored.
CONFIG_FILE = os.path.join(DATA_DIR, 'config.json')
CONFIG_SCHEMA = {'language': ('es', 'en')}


def _read_config():
    try:
        with open(CONFIG_FILE, encoding='utf-8') as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {k: v for k, v in data.items() if k in CONFIG_SCHEMA and v in CONFIG_SCHEMA[k]}


# Texts shown by the desktop shell itself (tray, notifications, file dialogs), in the app language
SHELL_TEXTS = {
    'es': {
        'open': 'Abrir Questleaf',
        'quit': 'Salir',
        'tray_title': 'Sigo aquí, en la bandeja',
        'tray_body': 'Así te llegan los recordatorios. Clic derecho en el ícono → Salir para cerrarla del todo.',
        'save_files': 'Partida de Questleaf (*.json)',
        'all_files': 'Todos los archivos (*.*)',
        'images': 'Imágenes (*.png;*.jpg;*.jpeg;*.webp;*.gif;*.bmp)',
        'music': 'Música (*.mp3;*.ogg;*.wav;*.m4a;*.aac;*.flac;*.opus;*.webm)',
        'focus': 'Enfoque',
        'note': 'Nota',
        'metronome': 'Metrónomo',
        'image_too_big': 'La imagen pesa más de 25 MB',
    },
    'en': {
        'open': 'Open Questleaf',
        'quit': 'Exit',
        'tray_title': 'Still here, in the tray',
        'tray_body': 'That is how your reminders arrive. Right-click the icon → Exit to close it completely.',
        'save_files': 'Questleaf save (*.json)',
        'all_files': 'All files (*.*)',
        'images': 'Images (*.png;*.jpg;*.jpeg;*.webp;*.gif;*.bmp)',
        'music': 'Music (*.mp3;*.ogg;*.wav;*.m4a;*.aac;*.flac;*.opus;*.webm)',
        'focus': 'Focus',
        'note': 'Note',
        'metronome': 'Metronome',
        'image_too_big': 'The image is larger than 25 MB',
    },
}


def shell_text(key):
    language = _read_config().get('language', 'es')
    return SHELL_TEXTS.get(language, SHELL_TEXTS['es'])[key]


def save_file_filter():
    return (shell_text('save_files'), shell_text('all_files'))


def _write_config(config):
    with _PROF_LOCK:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = CONFIG_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False)
        os.replace(tmp, CONFIG_FILE)  # atomic write


# Automatic backups: one a day, the last 30 are kept
BACKUP_DIR = _env('BACKUPS') or os.path.join(documents_dir(), APP_ID, 'Backups')
BACKUP_KEEP = 30


def _backup_tag(pid):
    return '' if pid == MAIN_PROFILE else f'{pid}-'  # every profile has its own backups


def daily_backup():
    """Before the first save of the day, copies the save as it was (how the day started)."""
    try:
        pid = _profiles()['active']
        src = profile_file(pid)
        tag = _backup_tag(pid)
        if not os.path.exists(src):
            return
        os.makedirs(BACKUP_DIR, exist_ok=True)
        target = os.path.join(BACKUP_DIR, f'save-{tag}{datetime.date.today().isoformat()}.json')
        if os.path.exists(target):
            return
        shutil.copy2(src, target)
        old = sorted(glob.glob(os.path.join(BACKUP_DIR, f'save-{tag}????-??-??.json')))
        for f in old[:-BACKUP_KEEP]:
            os.remove(f)
    except OSError:
        pass  # a failed backup must never stop a save


# My music: the audio files in the project's 'music' folder (next to the dist folder), or in a 'music' folder next
# to the .exe when it is moved elsewhere. A folder named 'musica' works too.
AUDIO_EXT = ('.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac', '.opus', '.webm')


def _has_audio(folder):
    try:
        return any(f.lower().endswith(AUDIO_EXT) for f in os.listdir(folder))
    except OSError:
        return False


def music_dir():
    if _env('MUSIC'):
        return _env('MUSIC')
    if getattr(sys, 'frozen', False):
        here = os.path.dirname(sys.executable)
        base = os.path.dirname(here) if os.path.basename(here).lower() == 'dist' else here
    else:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    english, spanish = os.path.join(base, 'music'), os.path.join(base, 'musica')
    return spanish if not _has_audio(english) and _has_audio(spanish) else english


def music_files():
    d = music_dir()
    if not os.path.isdir(d):
        return []
    return sorted((f for f in os.listdir(d) if f.lower().endswith(AUDIO_EXT) and os.path.isfile(os.path.join(d, f))),
                  key=str.lower)


class _MusicHandler(SimpleHTTPRequestHandler):
    """Serves only audio files of the music folder (no folder listing, no logs)."""

    def list_directory(self, path):
        self.send_error(404)

    def send_head(self):
        if not self.path.split('?', 1)[0].lower().endswith(AUDIO_EXT):
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, *args):
        pass


_music_server = None


def music_base():
    """Starts (once) the small music server on 127.0.0.1 and returns its address."""
    global _music_server
    if _music_server is None:
        os.makedirs(music_dir(), exist_ok=True)
        _music_server = ThreadingHTTPServer(('127.0.0.1', 0), partial(_MusicHandler, directory=music_dir()))
        _music_server.daemon_threads = True
        threading.Thread(target=_music_server.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{_music_server.server_address[1]}/'


def resource_dir():
    """Folder with the web files: inside the .exe (PyInstaller) or in the project."""
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, 'web')
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web')


PREFERRED_PORT = 42317


def pick_port():
    """A free port on 127.0.0.1 for pywebview's internal server.

    pywebview always uses 42001 and, when another pywebview app already holds it, the window ends up showing
    THAT app's page. So we pick our own free port.
    """
    for port in (PREFERRED_PORT, 0):  # 0 = any free port the system gives
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return s.getsockname()[1]
            except OSError:
                continue
    return None


def _dialog(kind):
    # pywebview >= 5 uses webview.FileDialog; older versions, loose constants
    if hasattr(webview, 'FileDialog'):
        return getattr(webview.FileDialog, kind)
    return getattr(webview, f'{kind}_DIALOG')


def _first(result):
    if not result:
        return None
    return result if isinstance(result, str) else result[0]


def _read(path):
    try:
        with open(path, encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return None


class FloatApi:
    """Bridge of one floating window (note or metronome): it only reaches its own data in the app."""

    def __init__(self, app, kind, ref, size):
        self._app, self._kind, self._ref, self._size = app, kind, ref, size
        self._folded = False
        self._win = None  # private: pywebview walks the public attributes of a js_api object

    def get(self):
        return self._app._main_js(f"typeof floatData === 'function' ? floatData({json.dumps(self._kind)}, {json.dumps(self._ref)}) : null")

    def put(self, data):
        if isinstance(data, dict):
            self._app._main_js(f"typeof floatApply === 'function' && floatApply({json.dumps(self._kind)}, {json.dumps(self._ref)}, {json.dumps(data)})")
        return True

    def pin(self, on):
        try:
            self._win.on_top = bool(on)
        except Exception:
            pass
        return bool(on)

    def fold(self, on):
        """Folded, the window is just its title bar."""
        self._folded = bool(on)
        try:
            width = self._win.width
            self._win.resize(width, 44 if self._folded else self._size[1])
        except Exception:
            pass
        return self._folded

    def show_app(self):
        self._app._show_window()
        return True

    def close(self):
        try:
            self._win.destroy()
        except Exception:
            pass
        return True


class Api:
    """Functions available in JavaScript as window.pywebview.api.*"""

    def __init__(self):
        self._window = None  # private: pywebview does not expose attributes that start with "_"
        self._tray = None
        self._close_to_tray = True   # the app confirms it when it starts (Settings)
        self._quitting = False
        self._hidden = False
        self._timers = {}
        self._next_timer = 1
        self._full = False
        self._mini = None                      # small floating pomodoro window
        self._floats = {}                      # floating note / metronome windows, by 'kind:ref'
        self._mini_state = {'running': False}  # what the app tells it (time, plant…)

    # ----- Windows media (Spotify or another app) for the Sanctuary -----
    # media is imported here and not at the top: that way the main window does not change its COM mode
    def media_state(self, with_thumb=False):
        import media
        return media.media_state(bool(with_thumb))

    def media_command(self, cmd):
        import media
        return media.media_command(str(cmd))

    def media_volume(self, value):
        import media
        return media.media_set_volume(value)

    def open_spotify(self):
        import media
        return media.open_spotify()

    # ----- Floating pomodoro: a small window always on top, outside the app -----
    def mini_open(self):
        if self._mini is not None or self._window is None:
            return True
        try:
            base = self._window.get_current_url() or ''
        except Exception:
            base = ''
        url = base.split('?')[0].rsplit('/', 1)[0] + '/mini.html' if base.startswith('http') else os.path.join(resource_dir(), 'mini.html')
        x = y = None
        try:
            sc = webview.screens[0]
            x, y = int(sc.width) - 290, 90  # top right: Windows notifications show at the bottom
        except Exception:
            pass
        self._mini = webview.create_window(shell_text('focus'), url=url, js_api=self, width=300, height=150, x=x, y=y,
                                           on_top=True, frameless=True, easy_drag=False, resizable=False,
                                           background_color='#1c2054')
        self._mini.events.closed += self._mini_closed
        return True

    def _mini_closed(self):
        self._mini = None

    def mini_close(self):
        w, self._mini = self._mini, None
        if w is not None:
            try:
                w.destroy()
            except Exception:
                pass
        return True

    def mini_push(self, data):
        if isinstance(data, dict):
            self._mini_state = data
        return True

    def mini_state(self):
        return self._mini_state

    def mini_cmd(self, cmd):
        if cmd == 'show':
            self._show_window()
            return True
        if self._window is not None:
            self._window.evaluate_js(f"typeof miniCmd === 'function' && miniCmd({json.dumps(str(cmd))})")
        return True

    # ----- Floating note and metronome: small windows above everything, outside the app -----
    FLOAT_SIZES = {'note': (340, 320, True), 'metro': (300, 190, False)}

    def float_open(self, kind, ref=''):
        kind, ref = str(kind), str(ref)[:40]
        if kind not in self.FLOAT_SIZES or self._window is None:
            return False
        key = f'{kind}:{ref}'
        if key in self._floats:
            try:
                self._floats[key]._win.restore()
                self._floats[key]._win.show()
            except Exception:
                pass
            return True
        try:
            base = self._window.get_current_url() or ''
        except Exception:
            base = ''
        url = base.split('?')[0].rsplit('/', 1)[0] + '/float.html' if base.startswith('http') else os.path.join(resource_dir(), 'float.html')
        width, height, resizable = self.FLOAT_SIZES[kind]
        x = y = None
        try:
            sc = webview.screens[0]
            below = sum(api._size[1] + 12 for api in self._floats.values())  # one under the other, under the pomodoro
            x, y = int(sc.width) - width - 20, 260 + below
        except Exception:
            pass
        api = FloatApi(self, kind, ref, (width, height))
        title = shell_text('note' if kind == 'note' else 'metronome')
        api._win = webview.create_window(title, url=url, js_api=api, width=width, height=height, x=x, y=y,
                                           on_top=True, frameless=True, easy_drag=False, resizable=resizable,
                                           min_size=(220, 44), background_color='#fff3b0' if kind == 'note' else '#1c2054')
        api._win.events.closed += partial(self._float_closed, key)
        self._floats[key] = api
        return True

    def _float_closed(self, key):
        self._floats.pop(key, None)
        if key.startswith('metro:') and self._window is not None:  # the metronome window owns the sound: say it stopped
            try:
                self._window.evaluate_js("typeof floatClosed === 'function' && floatClosed('metro')")
            except Exception:
                pass

    def float_close_all(self):
        for api in list(self._floats.values()):
            api.close()
        return True

    def _main_js(self, code):
        if self._window is None:
            return None
        try:
            return self._window.evaluate_js(code)
        except Exception:
            return None

    # ----- Start with Windows: an entry in the user's "Run" key (only in the .exe) -----
    _RUN_KEY = r'Software\Microsoft\Windows\CurrentVersion\Run'

    def autostart_get(self):
        if not getattr(sys, 'frozen', False):
            return None  # only makes sense in the .exe
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, self._RUN_KEY) as k:
                winreg.QueryValueEx(k, APP_ID)
                return True
        except OSError:
            return False

    def autostart_set(self, on):
        if not getattr(sys, 'frozen', False):
            return None
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, self._RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
            if on:
                winreg.SetValueEx(k, APP_ID, 0, winreg.REG_SZ, f'"{sys.executable}" --tray')
            else:
                try:
                    winreg.DeleteValue(k, APP_ID)
                except OSError:
                    pass
        return self.autostart_get()

    def _claim_autostart(self):
        """The startup entry follows the .exe that is opened (Questleaf.exe or Questleaf-personal.exe), keeping the
        user's choice: an entry that points to another build moves to this one."""
        if not getattr(sys, 'frozen', False) or _env('DATA'):
            return  # a test copy, with its own data folder, never takes over the user's entry
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, self._RUN_KEY, 0, winreg.KEY_QUERY_VALUE) as k:
                target = winreg.QueryValueEx(k, APP_ID)[0]
        except OSError:
            return  # not started with Windows
        if os.path.normcase(sys.executable) not in os.path.normcase(target):
            self.autostart_set(True)

    def set_fullscreen(self, on):
        """Full screen for the Sanctuary (only changes when needed)."""
        if self._window is None or bool(on) == self._full:
            return self._full
        self._full = bool(on)
        self._window.toggle_fullscreen()
        return self._full

    def load(self):
        daily_backup()
        pid = _profiles()['active']
        return _read(profile_file(pid))

    def save(self, data):
        os.makedirs(DATA_DIR, exist_ok=True)
        daily_backup()
        target = profile_file(_profiles()['active'])
        tmp = target + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            f.write(data)
        os.replace(tmp, target)  # atomic write: the file is never left half written
        return True

    # ----- App-wide config -----
    def config_get(self):
        """Device-wide preferences (shared by all profiles), e.g. {'language': 'en'}."""
        return _read_config()

    def config_set(self, key, value):
        """Stores one whitelisted preference. Returns False for unknown keys or values."""
        allowed = CONFIG_SCHEMA.get(str(key))
        if allowed is None or value not in allowed:
            return False
        with _PROF_LOCK:
            config = _read_config()
            config[str(key)] = value
            _write_config(config)
        if key == 'language' and self._tray is not None:
            self._ui(lambda: setattr(self._tray, 'ContextMenuStrip', self._tray_menu()))  # tray menu in the new language
        return True

    # ----- Profiles -----
    def profiles_get(self):
        reg = _profiles()
        out = []
        for p in reg['list']:
            f = profile_file(p['id'])
            info = {'id': p['id'], 'name': p.get('name', ''), 'photo': '', 'exists': os.path.exists(f)}
            raw = _read(f) if info['exists'] else None
            if raw:
                try:
                    d = json.loads(raw)
                    prof = (d.get('profile') or {}) if isinstance(d, dict) else {}
                    info['name'] = prof.get('name') or info['name']
                    photo = prof.get('photo') or ''
                    info['photo'] = photo if len(photo) < 800000 else ''
                except ValueError:
                    pass
            out.append(info)
        return {'active': reg['active'], 'list': out}

    def is_hidden(self):
        """True when the app started hidden in the tray (when the PC turned on)."""
        return bool(self._hidden)

    def profile_switch(self, pid):
        with _PROF_LOCK:
            reg = _profiles()
            if not any(p['id'] == pid for p in reg['list']):
                return False
            reg['active'] = pid
            _save_profiles(reg)
        return True

    def profile_create(self, name):
        import uuid
        with _PROF_LOCK:
            reg = _profiles()
            pid = uuid.uuid4().hex[:6]
            reg['list'].append({'id': pid, 'name': str(name)[:24]})
            reg['active'] = pid
            _save_profiles(reg)
        return pid

    def profile_touch(self, name):
        """Stores the name of the active profile and puts it in the window title."""
        name = str(name)[:24]
        with _PROF_LOCK:
            reg = _profiles()
            me = next((p for p in reg['list'] if p['id'] == reg['active']), None)
            if me is not None and me.get('name') != name:
                me['name'] = name
                _save_profiles(reg)
        if self._window is not None:
            try:
                self._window.set_title(f'{APP_TITLE} – {name}' if len(reg['list']) > 1 and name else APP_TITLE)
            except Exception:
                pass
        return True

    def profile_delete(self, pid):
        """Removes a profile (never the active one nor the main one). Its save is kept in Backups."""
        with _PROF_LOCK:
            reg = _profiles()
            if pid in (MAIN_PROFILE, reg['active']) or not any(p['id'] == pid for p in reg['list']):
                return False
            f = profile_file(pid)
            if os.path.exists(f):
                name = next((p.get('name') or pid for p in reg['list'] if p['id'] == pid), pid)
                safe = ''.join(c for c in name if c.isalnum() or c in ' -_').strip() or pid
                os.makedirs(BACKUP_DIR, exist_ok=True)
                target = os.path.join(BACKUP_DIR, f'deleted-profile-{safe}-{datetime.date.today().isoformat()}.json')
                if os.path.exists(target):  # another one with the same name removed today: never overwritten
                    target = target[:-5] + f'-{pid}.json'
                shutil.move(f, target)
            reg['list'] = [p for p in reg['list'] if p['id'] != pid]
            _save_profiles(reg)
        return True

    def export_file(self, data, filename):
        path = _first(self._window.create_file_dialog(
            _dialog('SAVE'), save_filename=filename, file_types=save_file_filter()))
        if not path:
            return False
        with open(path, 'w', encoding='utf-8') as f:
            f.write(data)
        return True

    def import_file(self):
        start = BACKUP_DIR if os.path.isdir(BACKUP_DIR) else ''
        path = _first(self._window.create_file_dialog(
            _dialog('OPEN'), directory=start, allow_multiple=False, file_types=save_file_filter()))
        return _read(path) if path else None

    def pick_image(self):
        """Opens the file picker for the profile photo; returns it as a data URL."""
        path = _first(self._window.create_file_dialog(
            _dialog('OPEN'), allow_multiple=False,
            file_types=(shell_text('images'),)))
        if not path:
            return None
        if os.path.getsize(path) > 25 * 1024 * 1024:
            raise ValueError(shell_text('image_too_big'))
        ext = os.path.splitext(path)[1].lower().lstrip('.')
        mime = {'jpg': 'jpeg', 'jpeg': 'jpeg', 'png': 'png', 'webp': 'webp', 'gif': 'gif', 'bmp': 'bmp'}.get(ext, 'png')
        with open(path, 'rb') as f:
            return f'data:image/{mime};base64,' + base64.b64encode(f.read()).decode('ascii')

    def backup_info(self):
        tag = _backup_tag(_profiles()['active'])  # only this profile's backups
        files = sorted(glob.glob(os.path.join(BACKUP_DIR, f'save-{tag}????-??-??.json')))
        last = os.path.basename(files[-1])[-15:-5] if files else None
        return {'dir': BACKUP_DIR, 'count': len(files), 'last': last}

    def open_backups(self):
        os.makedirs(BACKUP_DIR, exist_ok=True)
        os.startfile(BACKUP_DIR)
        return True

    def net_json(self, url):
        """JSON from known public services (weather, covers). Nothing else leaves from here."""
        import urllib.parse
        import urllib.request
        allowed = ('api.open-meteo.com', 'geocoding-api.open-meteo.com', 'openlibrary.org', 'itunes.apple.com',
                   'en.wikipedia.org', 'es.wikipedia.org')
        host = urllib.parse.urlparse(str(url)).hostname or ''
        if urllib.parse.urlparse(str(url)).scheme != 'https' or host not in allowed:
            return None
        try:
            req = urllib.request.Request(url, headers={'User-Agent': f'{APP_ID}/1.0'})
            with urllib.request.urlopen(req, timeout=8) as r:
                return json.loads(r.read(2_000_000).decode('utf-8'))
        except Exception:
            return None

    def music_setup(self):
        """Prepares the music folder and returns the local address it plays from."""
        d = music_dir()
        os.makedirs(d, exist_ok=True)
        try:
            base = music_base()
        except OSError:
            base = ''  # no server: the app asks for each piece with music_data
        return {'dir': os.path.realpath(d), 'base': base, 'files': music_files()}

    def music_list(self):
        return music_files()

    def music_add(self):
        """Picks pieces with the file picker and copies them to the music folder."""
        paths = self._window.create_file_dialog(
            _dialog('OPEN'), allow_multiple=True,
            file_types=(shell_text('music'),))
        d = music_dir()
        os.makedirs(d, exist_ok=True)
        for src in (paths or []):
            if src.lower().endswith(AUDIO_EXT):
                dst = os.path.join(d, os.path.basename(src))
                if not os.path.exists(dst):
                    shutil.copy2(src, dst)
        return music_files()

    def music_open(self):
        d = music_dir()
        os.makedirs(d, exist_ok=True)
        os.startfile(d)
        return True

    def music_data(self, name):
        """Plan B when the folder could not be served: the piece as a data URL."""
        name = os.path.basename(str(name))
        path = os.path.join(music_dir(), name)
        if not name.lower().endswith(AUDIO_EXT) or not os.path.isfile(path) or os.path.getsize(path) > 60 * 1024 * 1024:
            return None
        mime = {'.mp3': 'mpeg', '.ogg': 'ogg', '.wav': 'wav', '.m4a': 'mp4', '.aac': 'aac', '.flac': 'flac',
                '.opus': 'ogg', '.webm': 'webm'}[os.path.splitext(name)[1].lower()]
        with open(path, 'rb') as f:
            return f'data:audio/{mime};base64,' + base64.b64encode(f.read()).decode('ascii')

    # ---------- Windows tray ----------
    def _ui(self, fn):
        """Runs fn on the window's thread (WinForms requires it)."""
        from System import Action
        form = self._window.native
        if form.InvokeRequired:
            form.Invoke(Action(fn))
        else:
            fn()

    def _ensure_tray(self):
        if self._tray is not None:
            return
        from System.Drawing import Icon
        from System.Windows.Forms import NotifyIcon
        tray = NotifyIcon()
        tray.Icon = Icon.ExtractAssociatedIcon(sys.executable)
        tray.Text = APP_TITLE
        tray.ContextMenuStrip = self._tray_menu()
        tray.MouseClick += lambda s, e: self._show_window() if str(e.Button) == 'Left' else None
        tray.BalloonTipClicked += lambda s, e: self._show_window()
        tray.Visible = True
        self._tray = tray

    def _tray_menu(self):
        """Right-click menu of the tray icon, in the current app language."""
        from System.Windows.Forms import ContextMenuStrip
        menu = ContextMenuStrip()
        menu.Items.Add(shell_text('open')).Click += lambda s, e: self._show_window()
        menu.Items.Add(shell_text('quit')).Click += lambda s, e: self._quit()
        return menu

    def _show_window(self):
        from System.Windows.Forms import FormWindowState

        def do():
            form = self._window.native
            form.Show()
            if form.WindowState == FormWindowState.Minimized:
                form.WindowState = FormWindowState.Normal
            form.Activate()
            self._hidden = False
        self._ui(do)

    def _quit(self):
        self._quitting = True
        self._ui(lambda: self._window.native.Close())

    def _on_shown(self):
        self._ui(self._ensure_tray)

    def _on_closing(self):
        """The X hides the window in the tray (to keep reminding); 'Exit' in the menu really closes it."""
        if self._close_to_tray and not self._quitting:
            self._window.native.Hide()
            self._hidden = True
            self._first_tray_hint()
            if self._mini_state.get('running') and self._mini is None:
                threading.Thread(target=self.mini_open, daemon=True).start()
            return False  # cancels the closing
        self._cleanup()
        return None

    def _first_tray_hint(self):
        mark = os.path.join(DATA_DIR, '.tray-hint')
        if os.path.exists(mark):
            return
        try:
            open(mark, 'w').close()
        except OSError:
            pass
        self.notify(shell_text('tray_title'), shell_text('tray_body'))

    def set_close_to_tray(self, flag):
        self._close_to_tray = bool(flag)
        return self._close_to_tray

    def notify(self, title, message):
        """Windows notification (bottom right, even when the app is minimised or in the tray)."""
        from System.Windows.Forms import ToolTipIcon

        def show():
            self._ensure_tray()
            self._tray.ShowBalloonTip(8000, str(title)[:63], str(message)[:255], ToolTipIcon.Info)
        self._ui(show)
        return True

    def schedule_notify(self, seconds, title, message):
        """Schedules a notification (end of a focus session) that arrives on time even when the app is minimised."""
        tid = self._next_timer
        self._next_timer += 1

        def fire():
            if self._timers.pop(tid, None) is not None:
                self.notify(title, message)

        t = threading.Timer(max(0.0, float(seconds)), fire)
        t.daemon = True
        self._timers[tid] = t
        t.start()
        return tid

    def cancel_notify(self, tid):
        t = self._timers.pop(int(tid), None)
        if t is not None:
            t.cancel()
        return t is not None

    def _reminder_heartbeat(self):
        import time
        while not self._quitting:
            time.sleep(30)
            if self._hidden:
                try:
                    self._window.evaluate_js("typeof checkReminders === 'function' && checkReminders()")
                except Exception:
                    pass

    def _cleanup(self):
        self.mini_close()
        self.float_close_all()
        if self._tray is not None:
            try:
                tray = self._tray
                self._ui(lambda: (setattr(tray, 'Visible', False), tray.Dispose()))
            except Exception:
                pass
            self._tray = None

    def set_zoom(self, factor):
        """Native zoom of the window (like Ctrl + in Edge): bigger and sharper letters and images."""
        f = max(0.5, min(3.0, float(factor)))
        from System import Action  # pythonnet (only exists on Windows)
        wv = self._window.native.browser.webview
        wv.Invoke(Action(lambda: setattr(wv, 'ZoomFactor', f)))
        return f


def already_running():
    """When another copy with the same save is already open, asks it to show itself."""
    try:
        with socket.create_connection(('127.0.0.1', INSTANCE_PORT), timeout=0.6) as c:
            c.sendall(b'show')
        return True
    except OSError:
        return False


def listen_for_second_copy(api):
    try:
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.bind(('127.0.0.1', INSTANCE_PORT))
        srv.listen(2)
    except OSError:
        return  # the port is taken by something else: we go on without this protection

    def loop():
        while True:
            try:
                conn, _ = srv.accept()
                with conn:
                    if conn.recv(16) == b'show' and api._window is not None:
                        api._show_window()
            except Exception:
                continue
    threading.Thread(target=loop, daemon=True).start()


def media_selftest(out_path):
    """Questleaf.exe --media-test file.json: checks the connection with Windows media."""
    import media
    try:
        st = media.media_state(True)
        st['thumb'] = len(st.get('thumb') or '')
    except Exception as e:  # noqa: BLE001 - it is a diagnosis
        st = {'error': repr(e)}
    st['media_ok'] = media.MEDIA_OK
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(st, f, ensure_ascii=False)


def main():
    if '--media-test' in sys.argv:
        media_selftest(sys.argv[sys.argv.index('--media-test') + 1])
        return
    os.makedirs(DATA_DIR, exist_ok=True)
    if already_running():
        return
    api = Api()
    api._claim_autostart()
    window = webview.create_window(
        APP_TITLE,
        url=os.path.join(resource_dir(), 'index.html'),
        js_api=api,
        width=1440,
        height=900,
        min_size=(900, 600),
        background_color='#ebe3cf',
        text_select=False,
        hidden='--tray' in sys.argv,  # started with Windows: it starts hidden in the tray
    )
    api._window = window
    if '--tray' in sys.argv:
        api._hidden = True
        window.events.loaded += api._on_shown  # with no visible window, the icon is created on load
    window.events.shown += api._on_shown      # tray icon from the start
    window.events.closing += api._on_closing  # the X hides in the tray; 'Exit' closes
    listen_for_second_copy(api)
    threading.Thread(target=api._reminder_heartbeat, daemon=True).start()
    webview.start(
        private_mode=False,
        http_port=pick_port(),
        storage_path=os.path.join(DATA_DIR, 'webview'),
        debug='--debug' in sys.argv,
    )


if __name__ == '__main__':
    main()
