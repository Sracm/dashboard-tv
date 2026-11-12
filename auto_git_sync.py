import os
import subprocess
import time
import urllib.request
import json
from datetime import datetime

REPOSITORIES = [
    {
        "nome": "Dashboard TV (Oficial)",
        "path": r"C:\Users\amello\OneDrive - MQHAIR\T.I\PROJETOS BI\ANTIGRAVITY\PROJETOS\DASHBOARD_tv",
        "branch": "main"
    },
    {
        "nome": "Portfólio Standalone",
        "path": r"C:\Users\amello\OneDrive - MQHAIR\T.I\PROJETOS BI\ANTIGRAVITY\PROJETOS\INTRANET\portfolio_standalone",
        "branch": "main"
    }
]

LOG_FILE = r"C:\Users\amello\OneDrive - MQHAIR\T.I\PROJETOS BI\ANTIGRAVITY\PROJETOS\DASHBOARD_tv\auto_git_sync.log"
INTERVAL_SECONDS = 600  # 10 minutos (600 segundos)

def log(msg):
    now_str = datetime.now().strftime("[%Y-%m-%d %H:%M:%S]")
    line = f"{now_str} {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

def atualizar_dados_dashboard_tv():
    """Aciona a atualizacao dos dados e renovacao de cache do Dashboard TV (porta 5050)."""
    now = datetime.now()
    ano = now.year
    mes = now.month
    log(f"[DASHBOARD TV] 🔄 Iniciando rotina de atualizacao dos dados ({mes:02d}/{ano})...")

    endpoints = [
        ("Invalidar Cache /api/refresh", f"http://127.0.0.1:5050/api/refresh?ano={ano}"),
        ("Aquecer Vendas TV Mensal", f"http://127.0.0.1:5050/api/vendas_tv?mes={mes}&ano={ano}"),
        ("Aquecer Acumulado TV", f"http://127.0.0.1:5050/api/acumulado_tv?mes={mes}&ano={ano}"),
        ("Aquecer Categorias/Marcas", f"http://127.0.0.1:5050/api/categorias_dados?mes={mes}&ano={ano}")
    ]

    for nome, url in endpoints:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AutoRefreshDaemon/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                status = resp.status
                log(f"  [DASHBOARD TV] {nome}: HTTP {status} OK")
        except Exception as e:
            log(f"  [DASHBOARD TV] {nome}: {e}")

    log("[DASHBOARD TV] ✅ Atualização dos dados do dashboard concluída!")

def sync_repo(repo):
    path = repo["path"]
    nome = repo["nome"]
    branch = repo["branch"]

    if not os.path.exists(path):
        log(f"[{nome}] Pasta nao encontrada: {path}")
        return

    try:
        # 1. Verifica se ha alteracoes
        status_res = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=path,
            capture_output=True,
            text=True,
            timeout=30
        )
        changes = status_res.stdout.strip()

        if not changes:
            log(f"[{nome}] Sem alteracoes de arquivos pendentes no Git.")
            return

        log(f"[{nome}] Alteracoes detectadas:\n{changes}")

        # 2. git add
        subprocess.run(["git", "add", "-A"], cwd=path, check=True, timeout=30)

        # 3. git commit
        commit_msg = f"auto: atualizacao e sincronizacao {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        commit_res = subprocess.run(
            ["git", "commit", "-m", commit_msg],
            cwd=path,
            capture_output=True,
            text=True,
            timeout=30
        )
        log(f"[{nome}] Commit realizado: {commit_res.stdout.splitlines()[0] if commit_res.stdout else 'OK'}")

        # 4. git push
        push_res = subprocess.run(
            ["git", "push", "origin", branch],
            cwd=path,
            capture_output=True,
            text=True,
            timeout=60
        )
        if push_res.returncode == 0:
            log(f"[{nome}] Sucesso: Push enviado para origin/{branch}!")
        else:
            log(f"[{nome}] Aviso no push: {push_res.stderr.strip()}")

    except Exception as e:
        log(f"[{nome}] Erro ao sincronizar: {e}")

def main():
    log("=" * 65)
    log("ROTINA ATIVA: ATUALIZAR DADOS DO DASHBOARD E SALVAR NO GIT (10 MIN)")
    log("=" * 65)

    while True:
        ciclo_inicio = datetime.now()
        log(f"--- Novo Ciclo de Atualizacao & Git Sync Iniciado ({ciclo_inicio.strftime('%H:%M:%S')}) ---")

        # 1. Atualizar dados do Dashboard TV
        try:
            atualizar_dados_dashboard_tv()
        except Exception as e:
            log(f"[DASHBOARD TV] Erro na rotina de atualizacao: {e}")

        # 2. Sincronizar e salvar no GitHub
        for repo in REPOSITORIES:
            sync_repo(repo)

        log(f"Ciclo finalizado. Proxima atualizacao em {INTERVAL_SECONDS // 60} minutos.")
        time.sleep(INTERVAL_SECONDS)

if __name__ == "__main__":
    main()
