@echo off
REM Runs Questleaf from the source code (the first time it prepares .venv). Usage: run.bat [--debug]
setlocal
cd /d "%~dp0"
set "ROOT=%~dp0"
set "VENV=%ROOT%.venv"
if exist "%VENV%\.ready" goto :run

echo Preparing Questleaf the first time (a few minutes)...
set "BOOT=python"
where py >nul 2>nul && set "BOOT=py -3"
if not exist "%VENV%\Scripts\python.exe" %BOOT% -m venv "%VENV%" || goto :nopython
"%VENV%\Scripts\python.exe" -m pip install -q -r "%ROOT%desktop\requirements.txt" || goto :error
echo ok> "%VENV%\.ready"

:run
start "" "%VENV%\Scripts\pythonw.exe" "%ROOT%desktop\main.py" %*
exit /b 0

:nopython
echo.
echo   Questleaf needs Python 3.11 or newer: https://www.python.org/downloads/
echo   While installing it, check "Add python.exe to PATH". Then run this again.
pause
exit /b 1

:error
echo.
echo   Installing the requirements failed. Check the messages above and your internet connection.
pause
exit /b 1
