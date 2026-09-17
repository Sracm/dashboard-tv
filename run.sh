#!/bin/bash

# Acessa o diretório do script (útil se for chamado de outro lugar)
cd "$(dirname "$0")"

echo "==================================================="
echo "INICIANDO SERVIDOR DASHBOARD TV (PORTA 5050)..."
echo "==================================================="

# Inicia o app em background
python3 app.py &
APP_PID=$!

sleep 3

echo "==================================================="
echo "INICIANDO TUNEL EXTERNO (NGROK)..."
echo "==================================================="
# Inicia o ngrok em background
ngrok http 5050 &
NGROK_PID=$!

echo ""
echo "Tudo iniciado!"
echo "Acesso Local: http://localhost:5050/tv"
echo "Acesso Rede:  http://10.11.1.162:5050/tv"
echo "Acesso Paises: http://10.11.1.162:5050/paises?mes=8&ano=2026"
echo ""
echo "Pressione Ctrl+C para encerrar o servidor e o ngrok."

# Trata o Ctrl+C para fechar os processos filhos
trap "kill $APP_PID $NGROK_PID; exit" INT TERM

# Aguarda os processos para o script não fechar sozinho
wait
