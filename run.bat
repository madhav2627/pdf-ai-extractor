@echo off
setlocal EnableDelayedExpansion
title PDF Image Toolkit - Starting...

echo.
echo  ============================================
echo   PDF Image Toolkit  -  Starting up...
echo  ============================================
echo.

:: -------- 1. Find Python --------
set PYTHON_CMD=

python --version >nul 2>&1
if %errorlevel% == 0 (
    set PYTHON_CMD=python
    goto :python_found
)

python3 --version >nul 2>&1
if %errorlevel% == 0 (
    set PYTHON_CMD=python3
    goto :python_found
)

if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" goto :use313
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" goto :use312
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" goto :use311
if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" goto :use310
if exist "%LOCALAPPDATA%\Programs\Python\Python39\python.exe" goto :use39
if exist "%LOCALAPPDATA%\Programs\Python\Python38\python.exe" goto :use38
if exist "C:\Python313\python.exe" goto :usec313
if exist "C:\Python312\python.exe" goto :usec312
if exist "C:\Python311\python.exe" goto :usec311
if exist "C:\Python310\python.exe" goto :usec310
if exist "C:\Python39\python.exe" goto :usec39
if exist "C:\Python38\python.exe" goto :usec38

echo.
echo  [ERROR] Python was not found on this computer.
echo  Please install Python 3.8+ from https://www.python.org/downloads/
echo  Tick "Add Python to PATH" during setup.
echo.
pause
exit /b 1

:use313
set PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python313\python.exe
goto :python_found
:use312
set PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
goto :python_found
:use311
set PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python311\python.exe
goto :python_found
:use310
set PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python310\python.exe
goto :python_found
:use39
set PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python39\python.exe
goto :python_found
:use38
set PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python38\python.exe
goto :python_found
:usec313
set PYTHON_CMD=C:\Python313\python.exe
goto :python_found
:usec312
set PYTHON_CMD=C:\Python312\python.exe
goto :python_found
:usec311
set PYTHON_CMD=C:\Python311\python.exe
goto :python_found
:usec310
set PYTHON_CMD=C:\Python310\python.exe
goto :python_found
:usec39
set PYTHON_CMD=C:\Python39\python.exe
goto :python_found
:usec38
set PYTHON_CMD=C:\Python38\python.exe
goto :python_found

:python_found
echo  [OK] Python found: %PYTHON_CMD%

:: -------- 2. Switch to script folder --------
cd /d "%~dp0"
echo  [OK] Working directory: %CD%

:: -------- 3. Check venv health, recreate if broken --------
if exist .venv\Scripts\python.exe (
    .venv\Scripts\python.exe --version >nul 2>&1
    if !errorlevel! neq 0 (
        echo  [WARN] Existing .venv is broken - rebuilding...
        rmdir /s /q .venv
    ) else (
        echo  [OK] .venv is healthy.
        goto :venv_ready
    )
)

echo  [INFO] Creating virtual environment - one-time setup...
"%PYTHON_CMD%" -m venv .venv
if !errorlevel! neq 0 (
    echo  [ERROR] Could not create virtual environment.
    pause
    exit /b 1
)
echo  [OK] .venv created.

:venv_ready
:: -------- 4. Activate venv --------
call .venv\Scripts\activate.bat
echo  [OK] Virtual environment activated.

:: -------- 5. Upgrade pip --------
echo.
echo  [INFO] Upgrading pip...
python -m pip install --upgrade pip --quiet

:: -------- 6. Install requirements --------
echo  [INFO] Installing/verifying requirements...
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Package installation failed.
    echo  Check your internet connection and try again.
    pause
    exit /b 1
)
echo  [OK] All dependencies are ready.

:: -------- 7. Ensure folders exist --------
if not exist uploads mkdir uploads
if not exist outputs mkdir outputs

:: -------- 8. Launch Flask + open browser --------
set PORT=5000
echo.
echo  ============================================
echo   App running at: http://localhost:%PORT%
echo   Press Ctrl+C to stop the server.
echo  ============================================
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:%PORT%"

set FLASK_ENV=production
python app.py

echo.
echo  [INFO] Server has stopped.
pause
endlocal
