@echo off
setlocal
set "REVIEWER_URL=http://127.0.0.1:8000"
set "CHROME_EXE="

for /f "delims=" %%I in ('where chrome.exe 2^>nul') do if not defined CHROME_EXE set "CHROME_EXE=%%I"
if not defined CHROME_EXE if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined CHROME_EXE (
  start "" "%CHROME_EXE%" "%REVIEWER_URL%"
) else (
  start "" "%REVIEWER_URL%"
)
