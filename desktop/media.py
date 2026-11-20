"""Controls the music playing in Windows (Spotify or another app) for the Sanctuary, through the Windows media
controls: no login or Spotify Premium needed."""
import asyncio
import base64
import subprocess
import threading

_lock = threading.Lock()
_thumb_cache = {'key': None, 'url': ''}

try:  # without the libraries (e.g. in the browser) everything returns "not available"
    from winrt.windows.media.control import (
        GlobalSystemMediaTransportControlsSessionManager as _Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as _Status,
    )
    from winrt.windows.storage.streams import Buffer as _Buffer, DataReader as _Reader, InputStreamOptions as _Opts
    MEDIA_OK = True
except Exception:  # pragma: no cover
    MEDIA_OK = False


def _run(coro):
    """Each call comes from a pywebview thread: it runs in its own event loop."""
    return asyncio.run(coro)


async def _session():
    mgr = await _Manager.request_async()
    sessions = list(mgr.get_sessions())
    # Spotify first; otherwise whatever Windows considers the current session
    for s in sessions:
        if 'spotify' in (s.source_app_user_model_id or '').lower():
            return s
    return mgr.get_current_session()


def _app_name(aumid):
    a = (aumid or '').lower()
    if 'spotify' in a:
        return 'Spotify'
    for key, name in (('chrome', 'Chrome'), ('msedge', 'Edge'), ('firefox', 'Firefox'), ('zune', 'Media Player'),
                      ('music', 'Music'), ('vlc', 'VLC'), ('youtube', 'YouTube')):
        if key in a:
            return name
    return (aumid or 'Media Player').split('!')[-1][:24]


async def _thumb(props):
    key = (props.title, props.artist, props.album_title)
    if _thumb_cache['key'] == key:
        return _thumb_cache['url']
    url = ''
    try:
        ref = props.thumbnail
        if ref is not None:
            stream = await ref.open_read_async()
            size = int(stream.size)
            if 0 < size < 3_000_000:
                buf = _Buffer(size)
                buf = await stream.read_async(buf, size, _Opts.READ_AHEAD)
                reader = _Reader.from_buffer(buf)
                data = bytearray(buf.length)
                reader.read_bytes(data)
                mime = 'image/png' if data[:4] == b'\x89PNG' else 'image/jpeg'
                url = f'data:{mime};base64,' + base64.b64encode(bytes(data)).decode('ascii')
    except Exception:
        url = ''
    _thumb_cache.update(key=key, url=url)
    return url


async def _state(with_thumb):
    s = await _session()
    if s is None:
        return {'available': False}
    props = await s.try_get_media_properties_async()
    info = s.get_playback_info()
    ctl = info.controls
    tl = s.get_timeline_properties()
    pos = tl.position.total_seconds() if tl and tl.position else 0
    end = tl.end_time.total_seconds() if tl and tl.end_time else 0
    out = {
        'available': True,
        'app': _app_name(s.source_app_user_model_id),
        'title': props.title or '',
        'artist': props.artist or props.album_artist or '',
        'album': props.album_title or '',
        'playing': info.playback_status == _Status.PLAYING,
        'canNext': bool(ctl.is_next_enabled), 'canPrev': bool(ctl.is_previous_enabled),
        'shuffle': bool(info.is_shuffle_active) if info.is_shuffle_active is not None else None,
        'pos': pos, 'end': end,
        'aumid': s.source_app_user_model_id or '',
    }
    if with_thumb:
        out['thumb'] = await _thumb(props)
    return out


async def _command(cmd):
    s = await _session()
    if s is None:
        return False
    if cmd == 'toggle':
        return bool(await s.try_toggle_play_pause_async())
    if cmd == 'next':
        return bool(await s.try_skip_next_async())
    if cmd == 'prev':
        return bool(await s.try_skip_previous_async())
    if cmd == 'shuffle':
        cur = s.get_playback_info().is_shuffle_active
        return bool(await s.try_change_shuffle_active_async(not bool(cur)))
    return False


# ---------- Volume per app (Windows volume mixer) ----------
def _proc_names(aumid):
    a = (aumid or '').lower()
    if 'spotify' in a:
        return ('spotify.exe',)
    token = a.split('!')[-1].split('.')[0].split('_')[0]
    return (token + '.exe',) if token else ()


def _com_call(fn):
    """The Windows mixer (COM) is used on a separate thread in MTA mode: on the same thread as the asynchronous
    Windows queries, those queries would never finish."""
    out = {}

    def work():
        import sys
        sys.coinit_flags = 0  # COINIT_MULTITHREADED
        import comtypes
        try:
            comtypes.CoInitializeEx(0)
        except OSError:
            pass
        try:
            out['v'] = fn()
        except Exception:
            out['v'] = None
        finally:
            try:
                comtypes.CoUninitialize()
            except Exception:
                pass

    t = threading.Thread(target=work, daemon=True)
    t.start()
    t.join(5)
    return out.get('v')


def _audio_session(aumid):
    from pycaw.pycaw import AudioUtilities
    names = _proc_names(aumid)
    for sess in AudioUtilities.GetAllSessions():
        p = sess.Process
        if p is not None and p.name().lower() in names:
            return sess
    return None


def _get_volume(aumid):
    def fn():
        sess = _audio_session(aumid)
        return round(sess.SimpleAudioVolume.GetMasterVolume() * 100) if sess else None
    return _com_call(fn)


def media_state(with_thumb=True):
    if not MEDIA_OK:
        return {'available': False}
    with _lock:
        try:
            st = _run(_state(with_thumb))
        except Exception as e:  # Spotify closed in the middle of the query, etc.
            return {'available': False, 'error': str(e)[:120]}
    if st.get('available'):
        st['volume'] = _get_volume(st.pop('aumid', ''))
    return st


def media_command(cmd):
    if not MEDIA_OK:
        return False
    with _lock:
        try:
            return _run(_command(cmd))
        except Exception:
            return False


def media_set_volume(value):
    if not MEDIA_OK:
        return False
    with _lock:
        try:
            s = _run(_session())
            aumid = s.source_app_user_model_id if s else 'spotify'
        except Exception:
            return False

    def fn():
        sess = _audio_session(aumid)
        if not sess:
            return False
        sess.SimpleAudioVolume.SetMasterVolume(max(0.0, min(1.0, float(value) / 100)), None)
        return True
    return bool(_com_call(fn))


def open_spotify():
    """Opens Spotify without waiting for it to load (os.startfile can block)."""
    try:
        subprocess.Popen(['explorer.exe', 'spotify:'], creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        return True
    except OSError:
        return False
