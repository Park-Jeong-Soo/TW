@echo off
setlocal
cd /d "%~dp0"
set "REVIEWER_ROOT=%~dp0"
title PDF English Reviewer

set "OLLAMA_NO_CLOUD=1"
set "OLLAMA_HOST=127.0.0.1:11434"
set "REVIEWER_OLLAMA_WEB_SEARCH=0"
set "REVIEWER_OLLAMA_TOOL_CALLING=0"
set "REVIEWER_HOST=127.0.0.1"
set "LANGUAGETOOL_ENABLED=0"
set "OLLAMA_URL=http://127.0.0.1:11434/api/chat"
set "OLLAMA_MODEL=qwen2.5:7b"
set "MAX_REVIEW_SECONDS=14400"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REVIEWER_ROOT%scripts\start_local_engines.ps1"

set "PYTHON_EXE="
if not exist "%REVIEWER_ROOT%.venv\Scripts\python.exe" goto VENV_MISSING

"%REVIEWER_ROOT%.venv\Scripts\python.exe" -c "import sys" >nul 2>nul
if errorlevel 1 (
  echo [WARNING] Existing virtual environment is broken or unavailable.
  goto VENV_MISSING
)

set "PYTHON_EXE=%REVIEWER_ROOT%.venv\Scripts\python.exe"
goto RECHECK

:VENV_MISSING
echo.
echo PDF English Reviewer Preflight Check
echo.
echo [BLOCKED] Python Environment: .venv\Scripts\python.exe was not found or is not usable.
echo.
echo No software was downloaded or installed.
echo Open SETUP_GUIDE.md and use the IT-approved offline Python dependency setup.
echo.
choice /c 12 /n /m "[1] Open Setup Guide  [2] Exit: "
if errorlevel 2 exit /b 3
start "" notepad.exe "%REVIEWER_ROOT%SETUP_GUIDE.md"
exit /b 3

:RECHECK
"%PYTHON_EXE%" scripts\preflight.py
set "PREFLIGHT_EXIT=%ERRORLEVEL%"
if not "%PREFLIGHT_EXIT%"=="0" if not "%PREFLIGHT_EXIT%"=="2" if not "%PREFLIGHT_EXIT%"=="3" if not "%PREFLIGHT_EXIT%"=="4" set "PREFLIGHT_EXIT=3"
if "%PREFLIGHT_EXIT%"=="4" goto OPEN_EXISTING
if "%PREFLIGHT_EXIT%"=="0" goto START

echo.
if "%PREFLIGHT_EXIT%"=="3" (
  echo Reviewer cannot start because its local runtime or storage check failed.
) else (
  echo Available:
  echo - PDF Viewer
  echo - Project Glossary
  echo - Format Review
  echo - Terminology Review
  echo - Existing review results
  echo.
  echo Unavailable:
  echo - Context Review
)
echo.
echo [1] Open Setup Guide
echo [2] Start Basic Viewer
echo [3] Recheck Components
echo [4] Exit
choice /c 1234 /n /m "Select: "
if errorlevel 4 exit /b 2
if errorlevel 3 goto RECHECK
if errorlevel 2 (
  if "%PREFLIGHT_EXIT%"=="3" (
    echo.
    echo Basic Viewer is unavailable until Python dependencies, local storage, binding, and port checks pass.
    pause
    goto RECHECK
  )
  goto START
)
if errorlevel 1 (
  start "" notepad.exe "%REVIEWER_ROOT%SETUP_GUIDE.md"
  goto RECHECK
)

:START
echo.
echo Starting PDF English Reviewer...
echo Opening browser: http://127.0.0.1:8000
echo.
echo Reviewer is running.
echo If the browser does not open, use:
echo http://127.0.0.1:8000
echo.
echo To stop Reviewer, press Ctrl+C or close this console window.
start "" /min cmd.exe /d /c "timeout /t 2 /nobreak >nul & call ""%REVIEWER_ROOT%scripts\open_reviewer_chrome.bat"""
"%PYTHON_EXE%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
exit /b %ERRORLEVEL%

:OPEN_EXISTING
echo.
echo PDF English Reviewer is already running.
echo Opening browser: http://127.0.0.1:8000
call "%REVIEWER_ROOT%scripts\open_reviewer_chrome.bat"
exit /b 0



