@echo off
title MQ Hair - Dashboard TV
cd /d "C:\Users\amello\OneDrive - MQHAIR\T.I\PROJETOS BI\ANTIGRAVITY\PROJETOS\DASHBOARD_tv"

echo ===================================================
echo INICIANDO SERVIDOR DASHBOARD TV (PORTA 5050)...
echo ===================================================

start "Flask Server" python app.py
timeout /t 3 /nobreak >nul

echo ===================================================
echo INICIANDO TUNEL EXTERNO (NGROK)...
echo ===================================================
start "ngrok Tunnel" ngrok http 5050

echo.
echo Tudo iniciado!
echo Acesso Local: http://localhost:5050/tv
echo Acesso Rede:  http://10.11.1.162:5050/tv
echo Acesso Paises: http://10.11.1.162:5050/paises?mes=8^&ano=2026
echo.
pause
