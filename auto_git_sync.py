import os
import subprocess
import time
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
INTERVAL_SECONDS = 600  # 10 minutos

def log(msg):
    now_str = datetime.now().strftime("[%Y-%m-%d %H:%M:%S]")
    line = f"{now_str} {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

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
            log(f"[{nome}] Sem alteracoes pendentes. Tudo sincronizado.")
            return

        log(f"[{nome}] Alteracoes detectadas:\n{changes}")

        # 2. git add
        subprocess.run(["git", "add", "-A"], cwd=path, check=True, timeout=30)

        # 3. git commit
        commit_msg = f"auto: sincronizacao automatica {datetime.now().strftime('%Y-%m-%d %H:%M')}"
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
    log("=" * 60)
    log("ROTINA DE SINCRONIZACAO AUTOMATICA GIT (A CADA 10 MINUTOS) INICIADA")
    log("=" * 60)

    while True:
        log("Iniciando ciclo de verificacao...")
        for repo in REPOSITORIES:
            sync_repo(repo)

        log(f"Ciclo concluido. Aguardando {INTERVAL_SECONDS // 60} minutos para o proximo ciclo...")
        time.sleep(INTERVAL_SECONDS)

if __name__ == "__main__":
    main()
