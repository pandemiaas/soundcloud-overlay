@echo off
chcp 65001 >nul
title SoundCloud Overlay — GitHub Setup
cd /d "%~dp0"

echo ================================================
echo   SoundCloud Overlay — GitHub Setup Script
echo ================================================
echo.

REM Check if git is available
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git not found. Install from https://git-scm.com
    pause
    exit /b 1
)

REM Check if already a git repo
if exist .git (
    echo [INFO] Git repo already exists.
) else (
    echo [1/5] Initializing git repository...
    git init
    git branch -M main
)

echo.
echo [2/5] Adding files...
git add .

echo.
echo [3/5] Committing...
git commit -m "SoundCloud Overlay v1.1.0 — gaming overlay, vibe-coded 🤖"

if %errorlevel% neq 0 (
    echo [WARN] Nothing to commit or commit failed. Maybe already committed?
)

echo.
echo [4/5] Adding remote origin...
git remote remove origin 2>nul
git remote add origin https://github.com/pandemiaas/soundcloud-overlay.git

echo.
echo [5/5] Pushing to GitHub...
git push -u origin main

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Push failed. Check:
    echo   - Does https://github.com/pandemiaas/soundcloud-overlay exist?
    echo   - Are you logged in? Run: git config --global user.name "pandemias"
    echo                          git config --global user.email "your@email.com"
    echo   - Try: git push --force -u origin main
) else (
    echo.
    echo ================================================
    echo   ✓ SUCCESS! Project pushed to GitHub
    echo   https://github.com/pandemiaas/soundcloud-overlay
    echo ================================================
    echo.
    echo Next steps:
    echo   1. Go to GitHub → Settings → Secrets → Actions
    echo      (GITHUB_TOKEN is already set automatically)
    echo   2. Push a tag to trigger a release:
    echo      git tag v1.1.0
    echo      git push origin v1.1.0
    echo   3. GitHub Actions will build the installer and
    echo      attach it to the release automatically!
)

echo.
echo Press any key to close...
pause >nul
