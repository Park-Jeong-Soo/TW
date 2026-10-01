@echo off
setlocal
if not defined APPROVED_INSTALLER_FOLDER (
  echo APPROVED_INSTALLER_FOLDER is not configured.
  echo Ask IT or the security administrator for the approved internal or offline installer location.
  pause
  exit /b 2
)
if not exist "%APPROVED_INSTALLER_FOLDER%" (
  echo The configured approved installer folder does not exist:
  echo %APPROVED_INSTALLER_FOLDER%
  pause
  exit /b 2
)
start "" "%APPROVED_INSTALLER_FOLDER%"
