@echo off
cd /d "%~dp0"
start "" http://localhost:8766/
powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 -Port 8766
