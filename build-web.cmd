@echo off
cd /d C:\Users\rohan.cronje\Projects\QuickieFix
set CI=1
call npx expo export --platform web > webexp.log 2>&1
echo EXIT=%ERRORLEVEL% >> webexp.log
