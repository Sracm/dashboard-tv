#!/usr/bin/env bash
set -euo pipefail

# Sempre roda a partir da pasta do projeto
cd "$(dirname "$(readlink -f "$0")")"

echo "==================================================="
echo "INICIANDO SERVIDOR DASHBOARD TV (PORTA 5050)..."
echo "==================================================="

VENV_DIR="venv"
[ -d ".venv" ] && [ ! -d "venv" ] && VENV_DIR=".venv"

# Cria o ambiente virtual se ainda não existir
if [ ! -x "$VENV_DIR/bin/python" ]; then
    echo "Ambiente virtual não encontrado. Criando em $VENV_DIR..."
    python3 -m venv "$VENV_DIR" || {
        echo "Erro ao criar o venv. Instale com: sudo apt install -y python3-venv python3-pip" >&2
        exit 1
    }
fi

source "$VENV_DIR/bin/activate"

# Instala/atualiza dependencias se o stamp nao existir ou requirements.txt mudar
STAMP="$VENV_DIR/.requirements.stamp"
if [ -f requirements.txt ] && { [ ! -f "$STAMP" ] || [ requirements.txt -nt "$STAMP" ]; }; then
    echo "Instalando/atualizando dependencias do requirements.txt..."
    python -m pip install --upgrade pip
    python -m pip install -r requirements.txt
    touch "$STAMP"
fi

echo ""
echo "Servidor Dashboard TV ativo:"
echo "  Local:   http://localhost:5050/tv"
echo "  Rede:    http://0.0.0.0:5050/tv"
echo "Pressione Ctrl+C para encerrar."
echo ""

if command -v gunicorn &> /dev/null; then
    echo "Executando em produção via Gunicorn (Porta 5050)..."
    exec gunicorn --workers 4 --threads 4 --bind 0.0.0.0:5050 app:app
else
    echo "Executando via Python Flask..."
    exec python app.py "$@"
fi
