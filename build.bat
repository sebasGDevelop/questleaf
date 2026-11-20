@echo off
REM Builds dist\Questleaf.exe from web\. Usage: build.bat [--no-pause] [--personal]
REM --personal also packs web\js\data-notion.js (local first-run content) as dist\Questleaf-personal.exe.
setlocal
cd /d "%~dp0"
set "ROOT=%~dp0"
set "PY=%ROOT%.venv\Scripts\python.exe"
set "PAUSE=1"
set "PERSONAL=0"

:args
if "%~1"=="" goto :argsdone
if /i "%~1"=="--no-pause" set "PAUSE=0"
if /i "%~1"=="--personal" set "PERSONAL=1"
shift
goto :args
:argsdone

REM Each kind of build has its own copy of web\, so a personal file can never stay behind in a public one
if "%PERSONAL%"=="1" (set "BUNDLE=%ROOT%build\web-personal") else (set "BUNDLE=%ROOT%build\web-public")
if "%PERSONAL%"=="1" (set "EXE=Questleaf-personal") else (set "EXE=Questleaf")

REM The "py" launcher of python.org first: on some PCs "python" only opens the Microsoft Store
set "BOOT=python"
where py >nul 2>nul && set "BOOT=py -3"
if not exist "%PY%" (
  echo [1/5] Creating the Python environment ^(.venv^)...
  %BOOT% -m venv "%ROOT%.venv" || goto :error
)

echo [2/5] Installing dependencies...
"%PY%" -m pip install -q -r "%ROOT%desktop\requirements.txt" || goto :error

echo [3/5] Drawing the icon...
"%PY%" "%ROOT%desktop\make_icon.py" || goto :error

echo [4/5] Copying web\...
if "%PERSONAL%"=="1" (
  robocopy "%ROOT%web" "%BUNDLE%" /MIR /NFL /NDL /NJH /NJS /NP >nul
) else (
  robocopy "%ROOT%web" "%BUNDLE%" /MIR /NFL /NDL /NJH /NJS /NP /XF data-notion.js >nul
)
if errorlevel 8 goto :error
if "%PERSONAL%"=="0" if exist "%BUNDLE%\js\data-notion.js" (
  echo   web\js\data-notion.js must not be in a public build.
  goto :error
)

echo [5/5] Building %EXE%.exe ^(takes 1-2 minutes^)...
"%PY%" -m PyInstaller --noconfirm --clean --onefile --windowed --log-level WARN ^
  --name %EXE% ^
  --icon "%ROOT%desktop\icon.ico" ^
  --add-data "%BUNDLE%;web" ^
  --distpath "%ROOT%dist" --workpath "%ROOT%build" --specpath "%ROOT%build" ^
  "%ROOT%desktop\main.py" || goto :error

echo.
if "%PERSONAL%"=="1" (echo   DONE:  dist\%EXE%.exe  ^(with your personal first-run content^)) else (echo   DONE:  dist\%EXE%.exe)
echo.
if "%PAUSE%"=="1" pause
exit /b 0

:error
echo.
echo   The build failed. Check the messages above.
if "%PAUSE%"=="1" pause
exit /b 1
