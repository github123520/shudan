@echo off
setlocal

cd /d "%~dp0"

set "GIT_EXE=git"
if exist "C:\Program Files\Git\cmd\git.exe" set "GIT_EXE=C:\Program Files\Git\cmd\git.exe"

echo.
echo [1/5] Checking git...
"%GIT_EXE%" --version
if errorlevel 1 (
  echo.
  echo Git was not found. Please install Git for Windows, then run this file again.
  pause
  exit /b 1
)

if not exist ".git" (
  echo.
  echo This folder is not a git repository:
  echo %cd%
  pause
  exit /b 1
)

echo.
echo [2/5] Checking stale git lock...
if exist ".git\index.lock" (
  echo Found .git\index.lock. Removing it before commit.
  del /f /q ".git\index.lock"
  if errorlevel 1 (
    echo.
    echo Could not remove .git\index.lock.
    echo Close GitHub Desktop, VS Code, or any running git command, then run this file again.
    pause
    exit /b 1
  )
) else (
  echo No git lock found.
)

echo.
echo [3/5] Current changes:
"%GIT_EXE%" status --short
if errorlevel 1 (
  echo.
  echo git status failed.
  pause
  exit /b 1
)

echo.
echo [4/5] Staging and committing...
"%GIT_EXE%" add public/index.html src push-update.bat
if errorlevel 1 (
  echo.
  echo git add failed.
  pause
  exit /b 1
)

"%GIT_EXE%" diff --cached --quiet
if not errorlevel 1 (
  echo No staged changes to commit.
) else (
  "%GIT_EXE%" commit -m "Update qidiantu app"
  if errorlevel 1 (
    echo.
    echo git commit failed.
    pause
    exit /b 1
  )
)

echo.
echo [5/5] Pushing to GitHub...
"%GIT_EXE%" push
if errorlevel 1 (
  echo.
  echo git push failed.
  echo If this is a network/proxy problem, open a normal CMD and test:
  echo "%GIT_EXE%" ls-remote origin
  pause
  exit /b 1
)

echo.
echo Done. Changes have been pushed to GitHub.
pause
