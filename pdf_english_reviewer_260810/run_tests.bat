@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Python environment is missing. Run run_local.bat once first.
  exit /b 1
)
if not exist data\logs mkdir data\logs
.venv\Scripts\python.exe -m unittest discover -s tests -v > data\logs\test_latest.log 2>&1
set TEST_EXIT=%ERRORLEVEL%
type data\logs\test_latest.log
if not "%TEST_EXIT%"=="0" (
  echo.
  echo Tests failed. The failing test, exception, file, and line are recorded in:
  echo data\logs\test_latest.log
)
exit /b %TEST_EXIT%
