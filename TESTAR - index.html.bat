@echo off
REM Servidor local. Abrir o index.html com duplo clique NAO funciona:
REM modulos ES exigem http, nao file://
cd /d "%~dp0"
echo Abrindo http://localhost:8080 ...
start "" http://localhost:8080
py -m http.server 8080 2>nul || python -m http.server 8080
