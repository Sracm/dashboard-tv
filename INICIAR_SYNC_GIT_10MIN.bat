@echo off
title Sincronizador Automatico Git (10 em 10 Minutos)
color 0B
echo ========================================================
echo   SINCRONIZADOR AUTOMATICO GIT - DASHBOARD TV & PORTFOLIO
echo   Intervalo: a cada 10 minutos
echo ========================================================
echo.
cd /d "C:\Users\amello\OneDrive - MQHAIR\T.I\PROJETOS BI\ANTIGRAVITY\PROJETOS\DASHBOARD_tv"
python auto_git_sync.py
pause
