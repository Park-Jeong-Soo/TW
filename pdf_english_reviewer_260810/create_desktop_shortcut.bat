@echo off
setlocal
cd /d "%~dp0"
set "REVIEWER_ROOT=%~dp0"
set "SHORTCUT_NAME=PDF English Reviewer.lnk"

powershell.exe -NoProfile -Command ^
  "$desktop=[Environment]::GetFolderPath('Desktop');" ^
  "$shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop '%SHORTCUT_NAME%'));" ^
  "$shortcut.TargetPath=(Join-Path $env:REVIEWER_ROOT 'run_local.bat');" ^
  "$shortcut.WorkingDirectory=$env:REVIEWER_ROOT;" ^
  "$shortcut.IconLocation=($env:SystemRoot + '\System32\shell32.dll,70');" ^
  "$shortcut.Description='Start PDF English Reviewer with local Preflight checks';" ^
  "$shortcut.Save()"

if errorlevel 1 (
  echo Failed to create the desktop shortcut.
  exit /b 1
)
echo Desktop shortcut created: PDF English Reviewer
echo Target: %REVIEWER_ROOT%run_local.bat
