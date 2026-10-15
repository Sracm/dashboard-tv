import urllib.request
import json
import time

endpoints = [
    ('Vendas TV Mensal', 'http://127.0.0.1:5050/api/vendas_tv?mes=10&ano=2026&force=1'),
    ('Acumulado TV', 'http://127.0.0.1:5050/api/acumulado_tv?mes=10&ano=2026&force=1'),
    ('Categorias / Marcas', 'http://127.0.0.1:5050/api/categorias_dados?mes=10&ano=2026&refresh=1'),
    ('Empresa YTD', 'http://127.0.0.1:5050/api/empresa_tv?meses=1,2,3,4,5,6,7,8,9,10&ano=2026&force=1'),
    ('COMEX Países', 'http://127.0.0.1:5050/api/paises_dados?mes=10&ano=2026&refresh=1'),
    ('Mapa Brasil YTD (Outubro)', 'http://127.0.0.1:5050/api/mapa_regionais?mes=10&ano=2026&force=1'),
    ('Mapa Brasil YTD (Setembro)', 'http://127.0.0.1:5050/api/mapa_regionais?mes=9&ano=2026&force=1')
]

print("=" * 70)
print("INICIANDO CARGA E ATUALIZAÇÃO TOTAL DOS DADOS (ORACLE + SHAREPOINT)")
print("=" * 70)

for nome, url in endpoints:
    t0 = time.time()
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'ReloadClient'})
        with urllib.request.urlopen(req, timeout=120) as r:
            res = json.loads(r.read().decode())
            ok = res.get('success', False)
            dur = time.time() - t0
            if ok:
                print(f"  [OK] {nome:<25} carregado com sucesso ({dur:.2f}s)")
            else:
                print(f"  [ERRO] {nome:<25}: {res.get('error')}")
    except Exception as e:
        print(f"  [FALHA] {nome:<25}: {e}")

print("=" * 70)
print("CARGA DE DADOS CONCLUÍDA COM SUCESSO!")
print("=" * 70)
