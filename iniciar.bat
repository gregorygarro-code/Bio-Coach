@echo off
title FitCoach Casa
cd /d "%~dp0"
echo ============================================
echo   FitCoach Casa - iniciando (login + perfil)
echo ============================================
echo.

REM Backend con login/perfil y sin cache (recomendado)
where python >nul 2>nul
if %errorlevel%==0 (
  echo Abriendo http://localhost:8000 ...
  start "" http://localhost:8000
  python server.py
  goto :eof
)
where py >nul 2>nul
if %errorlevel%==0 (
  echo Abriendo http://localhost:8000 ...
  start "" http://localhost:8000
  py server.py
  goto :eof
)

echo No se encontro Python.
echo Instala Python desde https://www.python.org/downloads/ y vuelve a ejecutar este archivo.
echo.
pause


