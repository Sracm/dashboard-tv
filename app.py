import urllib.parse
import calendar
import time
import oracledb
import pandas as pd
from flask import Flask, render_template, jsonify, request, redirect
from datetime import datetime, date
import threading
import os
from dotenv import load_dotenv

import metricas_tempo as mt
from ai_agent import TypeSafeAgent

env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(env_path)

app = Flask(__name__)
mqia_agent = TypeSafeAgent()
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.before_request
def sanitize_future_months():
    # REGRA DEFINITIVA: Bloqueia páginas HTML que venham com mês no futuro no ano corrente
    if request.method == 'GET' and not request.path.startswith('/static') and not request.path.startswith('/api'):
        mes_req = request.args.get('mes')
        ano_req = request.args.get('ano')
        now = datetime.now()
        if ano_req and str(ano_req).isdigit() and int(ano_req) >= now.year:
            if mes_req and str(mes_req).isdigit() and int(mes_req) > now.month:
                args = request.args.to_dict()
                args['mes'] = str(now.month)
                args['ano'] = str(now.year)
                query = urllib.parse.urlencode(args)
                return redirect(f"{request.path}?{query}")

# Configurações do Banco Oracle
DB_USER = os.getenv("ORACLE_USER", "")
DB_PASS = os.getenv("ORACLE_PASSWORD", "")
DB_DSN = os.getenv("ORACLE_DSN", "")

EXCEL_METAS_PATH = os.path.join(
    os.path.expanduser('~'),
    'OneDrive - MQHAIR', 'T.I', 'PROJETOS BI', 'METAS MQ BASE', 'METAS MQ BASE.xlsx'
)
SQL_PATH = os.path.join(os.path.dirname(__file__), 'query', 'vendas_vendedor_gerente.sql')
DISK_CACHE_DIR = os.path.join(os.path.dirname(__file__), 'data', 'cache')
os.makedirs(DISK_CACHE_DIR, exist_ok=True)

def get_db_connection():
    conn = oracledb.connect(user=DB_USER, password=DB_PASS, dsn=DB_DSN)
    with conn.cursor() as cur:
        cur.execute("ALTER SESSION SET CURRENT_SCHEMA = SANKHYA")
    return conn

with open(SQL_PATH, "r", encoding="utf-8") as f:
    RAW_SQL_BASE = f.read()

def get_vendas_do_banco(mes, ano):
    _, num_days = calendar.monthrange(ano, mes)
    data_inicio = f"01/{mes:02d}/{ano}"
    data_fim = f"{num_days}/{mes:02d}/{ano}"

    # Otimização de pushdown para filtrar DTENTSAI no próprio Sankhya de forma instantânea
    d_filter = f"TGFCAB.DTENTSAI >= TO_DATE('{data_inicio}', 'DD/MM/YYYY') AND TGFCAB.DTENTSAI <= TO_DATE('{data_fim}', 'DD/MM/YYYY') AND "
    opt_sql = RAW_SQL_BASE.replace('WHERE TGFCAB.CODTIPOPER = TGFTOP.CODTIPOPER', 'WHERE ' + d_filter + 'TGFCAB.CODTIPOPER = TGFTOP.CODTIPOPER')
    opt_sql = opt_sql.replace("WHERE tgfcab.tipmov='P'", 'WHERE ' + d_filter + "tgfcab.tipmov='P'")

    final_query = f"""
    SELECT V.CODVEND, 
           P.MARCA,
           SUM(V.vendas) as TOTAL_VENDAS, 
           SUM(V.TotalFat) as TOTAL_FAT,
           SUM(V.TotalPrevisto) as TOTAL_PREV
    FROM (
        {opt_sql}
    ) V
    LEFT JOIN VW_MQ_TGFPRO_POWER_BI P ON TO_CHAR(V.codprod) = TO_CHAR(P.CODPROD)
    GROUP BY V.CODVEND, P.MARCA
    """
    
    conn = get_db_connection()
    try:
        df_vendas = pd.read_sql(final_query, conn)
    finally:
        conn.close()
        
    for c in ['TOTAL_VENDAS', 'TOTAL_FAT', 'TOTAL_PREV']:
        if c in df_vendas.columns:
            df_vendas[c] = pd.to_numeric(df_vendas[c], errors='coerce').fillna(0.0)

    return df_vendas

# ============================================================================
# POLÍTICA DE CACHE INTELIGENTE & PERFORMANCE PARA TV
# ============================================================================
CACHE_TTL = 900             # 15 minutos (fallback legado)
CACHE_TTL_REALTIME = 900    # 15 minutos para dados correntes do mês atual
CACHE_TTL_HEAVY = 1800      # 30 minutos para dados agregados pesados (Categorias, Marcas, Países)
CACHE_TTL_HISTORIC = 86400  # 24 horas para anos e meses já fechados no ERP

cached_df_metas = None
cached_df_setores = None
last_excel_read = 0
last_excel_mtime = 0

def invalidar_todos_os_caches(ano=None):
    global cached_df_metas, cached_df_setores, last_excel_read, last_excel_mtime
    global cached_painel_results, anos_carregados_no_cache, cached_vendas_diarias
    global cached_categorias_data, cached_paises_data, cached_paises_raw_df
    global cached_diario_data
    
    print(f"[CACHE] Forçando limpeza de caches (ano={ano})...")
    cached_df_metas = None
    cached_df_setores = None
    last_excel_read = 0
    last_excel_mtime = 0
    
    if ano:
        anos_carregados_no_cache.discard(ano)
        cached_vendas_diarias.pop(ano, None)
        keys_to_del = [k for k in list(cached_painel_results.keys()) if k.endswith(f"_{ano}")]
        for k in keys_to_del:
            cached_painel_results.pop(k, None)
    else:
        anos_carregados_no_cache.clear()
        cached_vendas_diarias.clear()
        cached_painel_results.clear()
        
    cached_categorias_data.clear()
    if 'cached_cat_raw_df' in globals():
        cached_cat_raw_df.clear()
    cached_paises_data.clear()
    cached_paises_raw_df.clear()
    cached_diario_data.clear()
    if 'cached_estoque_previsao' in globals() and isinstance(cached_estoque_previsao, dict):
        cached_estoque_previsao['data'] = None
        cached_estoque_previsao['timestamp'] = 0
    if 'cached_teste_estoque' in globals() and isinstance(cached_teste_estoque, dict):
        cached_teste_estoque['data'] = None
        cached_teste_estoque['timestamp'] = 0

def carregar_metas_e_setores(mes, ano, force_refresh=False):
    global cached_df_metas, cached_df_setores, last_excel_read, last_excel_mtime
    
    if force_refresh:
        cached_df_metas = None
        cached_df_setores = None
        last_excel_mtime = 0
        
    excel_mtime = os.path.getmtime(EXCEL_METAS_PATH) if os.path.exists(EXCEL_METAS_PATH) else 0
    precisa_recarregar = (
        cached_df_metas is None or 
        cached_df_setores is None or 
        excel_mtime != last_excel_mtime or 
        (time.time() - last_excel_read > CACHE_TTL_REALTIME)
    )
    
    if precisa_recarregar:
        print("[CACHE] Recarregando metas e base_setores do Excel...")
        try:
            df_m = pd.read_excel(EXCEL_METAS_PATH, sheet_name='TABELA METAS MQ GERAL')
            df_m.columns = df_m.columns.str.strip().str.upper()
            cached_df_metas = df_m
        except Exception as e:
            print(f"[ERRO METAS EXCEL] {e}")
            if cached_df_metas is None:
                cached_df_metas = pd.DataFrame(columns=['DATA', 'MES', 'MÊS', 'ANO', 'META', 'CANAL'])

        try:
            df_s = pd.read_excel(EXCEL_METAS_PATH, sheet_name='BASE SETORES')
            df_s.columns = df_s.columns.str.strip().str.upper()
            cached_df_setores = df_s
        except Exception as e:
            print(f"[ERRO SETORES EXCEL] {e}")
            if cached_df_setores is None:
                cached_df_setores = pd.DataFrame(columns=['CODVEND', 'SETOR', 'VENDEDOR'])
        
        last_excel_mtime = excel_mtime
        last_excel_read = time.time()
        
    if cached_df_metas is None:
        cached_df_metas = pd.DataFrame(columns=['DATA', 'MES', 'MÊS', 'ANO', 'META', 'CANAL'])
    if cached_df_setores is None:
        cached_df_setores = pd.DataFrame(columns=['CODVEND', 'SETOR', 'VENDEDOR'])

    df_metas = cached_df_metas.copy()
    
    # O Power BI faz o relacionamento entre TABELA METAS MQ GERAL e CALENDARIO pela coluna DATA!
    # Na planilha Excel, algumas linhas (ex: Maio/2026) foram digitadas com erro na coluna MÊS (colocaram 6),
    # mas a coluna DATA está perfeitamente correta (2026-05-01). Filtrar por DATA garante precisão total.
    df_metas['DATA_DT'] = pd.to_datetime(df_metas['DATA'], errors='coerce')
    mask_data = (df_metas['DATA_DT'].dt.month == mes) & (df_metas['DATA_DT'].dt.year == ano)
    
    if mask_data.sum() > 0:
        df_metas_filtradas = df_metas[mask_data].copy()
    else:
        # Fallback caso a coluna DATA não esteja preenchida
        mes_col = [c for c in df_metas.columns if c.startswith('M') and 'META' not in c and len(c) <= 4]
        col_m = mes_col[0] if mes_col else ('MÊS' if 'MÊS' in df_metas.columns else 'MES')
        df_metas_filtradas = df_metas[
            (pd.to_numeric(df_metas[col_m], errors='coerce') == mes) & 
            (pd.to_numeric(df_metas['ANO'], errors='coerce') == ano)
        ].copy()
    
    if 'META' in df_metas_filtradas.columns:
        df_metas_filtradas['META'] = pd.to_numeric(df_metas_filtradas['META'], errors='coerce').fillna(0.0)

    df_setores = cached_df_setores.copy()
    
    return df_metas_filtradas, df_setores

CANAIS_PAINEL = [
    "VAREJO ESPECIALIZADO - SP",
    "VAREJO ESPECIALIZADO REG.",
    "DISTRIBUIÇÃO",
    "COMEX",
    "E-COMMERCE",
    "E-COMMERCE - PARLUX",
    "EMPRESA",
]

SETORES_REG = ['NO - ND', 'RJ - MG - ES', 'SUL']
SETORES_DIST = ['DISTRIBUIÇÃO', 'VAGNER LUZ DA S']


def calcular_realizado_por_canal(df_vendas, df_setores):
    """Realizado (TOTAL_PREV) por canal para QUALQUER recorte de vendas.

    Única fonte da segmentação de canais: as medidas de tempo (YTD/YoY/MoM) e o
    percentual de meta passam exatamente pelas mesmas regras, o que elimina a
    chance de um indicador divergir do outro.
    """
    vazio = {c: 0.0 for c in CANAIS_PAINEL}
    vazio["E-COMMERCE - MQ"] = 0.0
    if df_vendas is None or len(df_vendas) == 0 or 'TOTAL_PREV' not in df_vendas.columns:
        return vazio

    df = pd.merge(df_vendas, df_setores[['CODVEND', 'SETOR', 'VENDEDOR']], on='CODVEND', how='left')
    if 'SETOR' not in df.columns:
        return vazio

    def soma(mask):
        return float(df[mask]['TOTAL_PREV'].sum())

    v_sp = soma(df['SETOR'] == 'SP')
    v_reg = soma(df['SETOR'].isin(SETORES_REG))
    v_dist = soma(df['SETOR'].isin(SETORES_DIST))
    v_comex = soma(df['SETOR'] == 'COMEX')

    if 'MARCA' in df.columns:
        v_ecom = soma((df['SETOR'] == 'E-COMMERCE') & (df['MARCA'] != 'PARLUX'))
        v_parlux = soma((df['SETOR'] == 'E-COMMERCE') & (df['MARCA'] == 'PARLUX'))
    else:
        v_ecom = 0.0
        v_parlux = 0.0

    v_empresa = float(df_vendas['TOTAL_PREV'].sum())

    return {
        "VAREJO ESPECIALIZADO - SP": v_sp,
        "VAREJO ESPECIALIZADO REG.": v_reg,
        "DISTRIBUIÇÃO": v_dist,
        "COMEX": v_comex,
        "E-COMMERCE": v_ecom,
        "E-COMMERCE - MQ": v_ecom,
        "E-COMMERCE - PARLUX": v_parlux,
        "EMPRESA": v_empresa,
    }


def calcular_meta_por_canal(df_metas):
    vazio = {c: 0.0 for c in CANAIS_PAINEL}
    vazio["E-COMMERCE - MQ"] = 0.0
    if df_metas is None or len(df_metas) == 0 or 'META' not in df_metas.columns or 'SETOR' not in df_metas.columns:
        return vazio

    def soma(mask):
        return float(df_metas[mask]['META'].sum())

    m_sp = soma(df_metas['SETOR'] == 'SP')
    m_reg = soma(df_metas['SETOR'].isin(SETORES_REG))
    m_dist = soma(df_metas['SETOR'].isin(SETORES_DIST))
    m_comex = soma(df_metas['SETOR'] == 'COMEX')

    if 'VENDEDOR' in df_metas.columns:
        m_ecom = soma((df_metas['SETOR'] == 'E-COMMERCE') & (df_metas['VENDEDOR'] != 'LOJA VTEX PARLUX'))
        m_parlux = soma(df_metas['VENDEDOR'] == 'LOJA VTEX PARLUX')
    else:
        m_ecom = 0.0
        m_parlux = 0.0

    m_empresa = float(df_metas['META'].sum())

    return {
        "VAREJO ESPECIALIZADO - SP": m_sp,
        "VAREJO ESPECIALIZADO REG.": m_reg,
        "DISTRIBUIÇÃO": m_dist,
        "COMEX": m_comex,
        "E-COMMERCE": m_ecom,
        "E-COMMERCE - MQ": m_ecom,
        "E-COMMERCE - PARLUX": m_parlux,
        "EMPRESA": m_empresa,
    }


def calcular_metricas_painel(df_vendas, df_metas, df_setores):
    realizados = calcular_realizado_por_canal(df_vendas, df_setores)
    metas = calcular_meta_por_canal(df_metas)

    resultado = {}
    for canal in realizados:
        v = realizados[canal]
        m = metas.get(canal, 0.0)
        pct = (v / m * 100) if m > 0 else 0.0
        resultado[canal] = {"percentual": round(pct, 1), "realizado": v, "meta": m}
    return resultado


def carregar_vendas_ano(ano):
    data_inicio = f"01/01/{ano}"
    data_fim = f"31/12/{ano}"
    d_filter = f"TGFCAB.DTENTSAI >= TO_DATE('{data_inicio}', 'DD/MM/YYYY') AND TGFCAB.DTENTSAI <= TO_DATE('{data_fim}', 'DD/MM/YYYY') AND "
    opt_sql = RAW_SQL_BASE.replace('WHERE TGFCAB.CODTIPOPER = TGFTOP.CODTIPOPER', 'WHERE ' + d_filter + 'TGFCAB.CODTIPOPER = TGFTOP.CODTIPOPER')
    opt_sql = opt_sql.replace("WHERE tgfcab.tipmov='P'", 'WHERE ' + d_filter + "tgfcab.tipmov='P'")

    # Granularidade DIARIA: sem o dia nao e possivel recortar MTD/YTD na data
    # de corte, e toda comparacao YoY/MoM de mes em andamento fica distorcida.
    final_query = f"""
    SELECT TRUNC(V.DTENTSAI) as DATA,
           TO_NUMBER(TO_CHAR(V.DTENTSAI, 'MM')) as MES,
           V.CODVEND, 
           P.MARCA,
           SUM(V.vendas) as TOTAL_VENDAS, 
           SUM(V.TotalFat) as TOTAL_FAT,
           SUM(V.TotalPrevisto) as TOTAL_PREV
    FROM (
        {opt_sql}
    ) V
    LEFT JOIN VW_MQ_TGFPRO_POWER_BI P ON TO_CHAR(V.codprod) = TO_CHAR(P.CODPROD)
    GROUP BY TRUNC(V.DTENTSAI), TO_NUMBER(TO_CHAR(V.DTENTSAI, 'MM')), V.CODVEND, P.MARCA
    """
    conn = get_db_connection()
    try:
        df_ano = pd.read_sql(final_query, conn)
    finally:
        conn.close()
    for c in ['TOTAL_VENDAS', 'TOTAL_FAT', 'TOTAL_PREV']:
        if c in df_ano.columns:
            df_ano[c] = pd.to_numeric(df_ano[c], errors='coerce').fillna(0.0)
    if 'DATA' in df_ano.columns:
        df_ano['DATA'] = pd.to_datetime(df_ano['DATA'], errors='coerce')
    return df_ano

cached_painel_results = {}
anos_carregados_no_cache = set()

# Vendas diarias cruas por ano: base das medidas de tempo (YTD/YoY/MoM).
cached_vendas_diarias = {}


def obter_vendas_diarias(ano, force_refresh=False):
    """DataFrame de vendas diarias do ano, com cache em memória e em disco."""
    now_ts = time.time()
    disk_file = os.path.join(DISK_CACHE_DIR, f'vendas_diarias_{ano}.pkl')
    ano_atual = datetime.now().year
    ttl = CACHE_TTL_HISTORIC if ano < ano_atual else CACHE_TTL_REALTIME

    if not force_refresh and ano in cached_vendas_diarias:
        df, ts = cached_vendas_diarias[ano]
        if now_ts - ts < ttl:
            return df

    if not force_refresh and os.path.exists(disk_file):
        file_age = now_ts - os.path.getmtime(disk_file)
        if file_age < ttl:
            try:
                df = pd.read_pickle(disk_file)
                cached_vendas_diarias[ano] = (df, now_ts)
                return df
            except Exception as e:
                print(f"[CACHE DISCO] Erro ao ler {disk_file}: {e}")

    try:
        df = carregar_vendas_ano(ano)
        try:
            df.to_pickle(disk_file)
        except Exception as e:
            print(f"[CACHE DISCO] Erro ao salvar {disk_file}: {e}")
    except Exception as e:
        print(f"[MEDIDAS] Erro ao carregar vendas diarias de {ano}: {e}")
        df = pd.DataFrame(columns=['DATA', 'MES', 'CODVEND', 'MARCA', 'TOTAL_VENDAS', 'TOTAL_FAT', 'TOTAL_PREV'])
    cached_vendas_diarias[ano] = (df, now_ts)
    return df


def _realizado_intervalo(df, inicio, fim, df_setores):
    """Realizado por canal no intervalo fechado [inicio, fim]."""
    if df is None or len(df) == 0 or 'DATA' not in df.columns:
        return calcular_realizado_por_canal(None, df_setores)
    datas = pd.to_datetime(df['DATA'], errors='coerce')
    mask = (datas >= pd.Timestamp(inicio)) & (datas <= pd.Timestamp(fim))
    return calcular_realizado_por_canal(df[mask], df_setores)


def calcular_medidas_tempo_canais(mes, ano, hoje=None, force_refresh=False):
    """YTD, YoY e MoM por canal, com periodos sempre equivalentes.

    Toda a aritmetica de calendario vive em metricas_tempo.py (validado por
    tests/test_metricas_tempo.py); aqui apenas somamos o realizado de cada
    canal nos intervalos que aquele modulo define.
    """
    corte = mt.data_corte_contexto(mes, ano, hoje)
    parcial = mt.mes_esta_parcial(corte)

    df_atual = obter_vendas_diarias(ano, force_refresh=force_refresh)
    df_ant = obter_vendas_diarias(ano - 1, force_refresh=force_refresh)
    _, df_setores = carregar_metas_e_setores(mes, ano, force_refresh=force_refresh)

    # Meta acumulada do ano: metas CHEIAS de janeiro ate o mes do corte, mesmo
    # criterio do velocimetro, que confronta o realizado parcial do mes com a
    # meta inteira daquele mes.
    meta_ytd = {}
    for m in range(1, corte.month + 1):
        df_metas_m, _ = carregar_metas_e_setores(m, ano, force_refresh=False)
        for canal, valor in calcular_meta_por_canal(df_metas_m).items():
            meta_ytd[canal] = meta_ytd.get(canal, 0.0) + valor

    ini_mtd, fim_mtd = mt.periodo_mes_atual(corte)
    ini_mom, fim_mom = mt.periodo_mes_anterior(corte, parcial)
    ini_yoy, fim_yoy = mt.periodo_ano_anterior_mes(corte, parcial)
    ini_ytd, fim_ytd = mt.periodo_ytd(corte)
    ini_ytda, fim_ytda = mt.periodo_ytd_ano_anterior(corte, parcial)

    # Janeiro compara com dezembro do ano anterior: o MoM sai do outro DataFrame.
    df_mom = df_atual if fim_mom.year == ano else df_ant

    mtd = _realizado_intervalo(df_atual, ini_mtd, fim_mtd, df_setores)
    mes_ant = _realizado_intervalo(df_mom, ini_mom, fim_mom, df_setores)
    mes_ano_ant = _realizado_intervalo(df_ant, ini_yoy, fim_yoy, df_setores)
    ytd = _realizado_intervalo(df_atual, ini_ytd, fim_ytd, df_setores)
    ytd_ant = _realizado_intervalo(df_ant, ini_ytda, fim_ytda, df_setores)

    medidas = {}
    for canal in mtd:
        v_mtd = mtd[canal]
        v_mom = mes_ant.get(canal, 0.0)
        v_yoy = mes_ano_ant.get(canal, 0.0)
        v_ytd = ytd[canal]
        v_ytda = ytd_ant.get(canal, 0.0)
        v_meta_ytd = meta_ytd.get(canal, 0.0)
        medidas[canal] = {
            "mtd": round(v_mtd, 2),
            "meta_ytd": round(v_meta_ytd, 2),
            "ytd_pct": round(v_ytd / v_meta_ytd * 100, 1) if v_meta_ytd > 0 else None,
            "mes_anterior": round(v_mom, 2),
            "mes_ano_anterior": round(v_yoy, 2),
            "ytd": round(v_ytd, 2),
            "ytd_anterior": round(v_ytda, 2),
            "mom": mt.divide_seguro(v_mtd, v_mom),
            "yoy": mt.divide_seguro(v_mtd, v_yoy),
            "ytd_yoy": mt.divide_seguro(v_ytd, v_ytda),
        }

    contexto = {
        "corte": corte.isoformat(),
        "parcial": parcial,
        "dias": corte.day,
        "periodos": {
            "mtd": [ini_mtd.isoformat(), fim_mtd.isoformat()],
            "mes_anterior": [ini_mom.isoformat(), fim_mom.isoformat()],
            "mes_ano_anterior": [ini_yoy.isoformat(), fim_yoy.isoformat()],
            "ytd": [ini_ytd.isoformat(), fim_ytd.isoformat()],
            "ytd_anterior": [ini_ytda.isoformat(), fim_ytda.isoformat()],
        },
    }
    return medidas, contexto

def carregar_ano_completo_no_cache(ano, force=False):
    now_ts = time.time()
    ano_atual = datetime.now().year
    ttl = CACHE_TTL_HISTORIC if ano < ano_atual else CACHE_TTL_REALTIME
    if not force and ano in anos_carregados_no_cache:
        mes_test = f"1_{ano}"
        if mes_test in cached_painel_results and (now_ts - cached_painel_results[mes_test][1] < ttl):
            return
    try:
        print(f"[CACHE] Carregando vendas do ano {ano} completo no Oracle (force={force})...")
        df_ano = obter_vendas_diarias(ano, force_refresh=force)
        if force:
            carregar_metas_e_setores(1, ano, force_refresh=True)
        for m in range(1, 13):
            df_m = df_ano[df_ano['MES'] == m].copy() if len(df_ano) > 0 and 'MES' in df_ano else pd.DataFrame(columns=['CODVEND', 'MARCA', 'TOTAL_VENDAS', 'TOTAL_FAT', 'TOTAL_PREV'])
            df_metas_m, df_setores = carregar_metas_e_setores(m, ano, force_refresh=False)
            res = calcular_metricas_painel(df_m, df_metas_m, df_setores)
            cached_painel_results[f"{m}_{ano}"] = (res, now_ts)
        anos_carregados_no_cache.add(ano)
        print(f"[CACHE] Ano {ano} carregado com sucesso no cache em memória.")
    except Exception as e:
        print(f"[CACHE] Erro ao carregar ano {ano}: {e}")

def obter_dados_painel(mes, ano, force_refresh=False):
    cache_key = f"{mes}_{ano}"
    now_ts = time.time()
    ano_atual = datetime.now().year
    ttl = CACHE_TTL_HISTORIC if ano < ano_atual else CACHE_TTL_REALTIME
    if not force_refresh and cache_key in cached_painel_results:
        res, ts = cached_painel_results[cache_key]
        if now_ts - ts < ttl:
            return res

    carregar_ano_completo_no_cache(ano, force=force_refresh)
    if cache_key in cached_painel_results:
        return cached_painel_results[cache_key][0]

    # Fallback individual caso necessário
    df_vendas = get_vendas_do_banco(mes, ano)
    df_metas, df_setores = carregar_metas_e_setores(mes, ano, force_refresh=force_refresh)
    res = calcular_metricas_painel(df_vendas, df_metas, df_setores)
    cached_painel_results[cache_key] = (res, now_ts)
    return res

def obter_ultimo_mes_com_metas(ano=None):
    """Retorna o último mês que possui metas cadastradas (evita abrir mês com meta zero)."""
    if ano is None:
        ano = datetime.now().year
    now = datetime.now()
    mes_atual = now.month if ano == now.year else 12
    for m in range(mes_atual, 0, -1):
        df_m, _ = carregar_metas_e_setores(m, ano, force_refresh=False)
        total_meta = df_m['META'].sum() if ('META' in df_m.columns and len(df_m) > 0) else 0.0
        if total_meta > 0:
            return m
    return mes_atual

@app.route('/api/ultimo_mes_metas')
def api_ultimo_mes_metas():
    try:
        ano = int(request.args.get('ano', datetime.now().year))
        ultimo_mes = obter_ultimo_mes_com_metas(ano)
        return jsonify({
            "success": True,
            "ano": ano,
            "ultimo_mes": ultimo_mes,
            "mes_atual": datetime.now().month,
            "mes_atual_tem_metas": (ultimo_mes == datetime.now().month)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/')
@app.route('/tv')
def dashboard_tv():
    return render_template('index.html')

@app.route('/api/vendas_tv')
def api_vendas_tv():
    try:
        force = request.args.get('refresh') in ('1', 'true', 'True') or request.args.get('force') in ('1', 'true', 'True')
        ano_req = request.args.get('ano')
        now_dt = datetime.now()
        ano = int(ano_req) if ano_req else now_dt.year
        mes_req = request.args.get('mes')
        if mes_req and str(mes_req).isdigit():
            mes = int(mes_req)
            if ano >= now_dt.year and mes > now_dt.month:
                mes = now_dt.month
        else:
            mes = now_dt.month

        if force:
            invalidar_todos_os_caches(ano)

        mes_ant_m = 12 if mes == 1 else mes - 1
        ano_ant_m = ano - 1 if mes == 1 else ano

        dados_atual = obter_dados_painel(mes, ano, force_refresh=force)
        dados_mes_ant = obter_dados_painel(mes_ant_m, ano_ant_m, force_refresh=force)
        dados_ano_ant = obter_dados_painel(mes, ano - 1, force_refresh=force)

        medidas, contexto = calcular_medidas_tempo_canais(mes, ano, force_refresh=force)

        equipes = []
        for setor in CANAIS_PAINEL:
            if setor == "E-COMMERCE - MQ":
                continue
            atual = dados_atual.get(setor, {"percentual": 0, "realizado": 0, "meta": 0})
            ant_m = dados_mes_ant.get(setor, {"percentual": 0, "realizado": 0, "meta": 0})
            ant_y = dados_ano_ant.get(setor, {"percentual": 0, "realizado": 0, "meta": 0})
            med = medidas.get(setor, {})

            display_name = "E-COMMERCE - MQ" if setor == "E-COMMERCE" else setor
            equipes.append({
                "name": display_name,
                "percent": atual['percentual'],
                "realizado": atual['realizado'],
                "meta": atual['meta'],
                "prev_month_percent": ant_m['percentual'],
                "prev_year_percent": ant_y['percentual'],
                # Medidas de tempo com periodos equivalentes. None = sem base de
                # comparacao; a UI mostra "—" em vez de inventar um percentual.
                "mtd": med.get("mtd", 0.0),
                "mes_anterior": med.get("mes_anterior", 0.0),
                "mes_ano_anterior": med.get("mes_ano_anterior", 0.0),
                "ytd": med.get("ytd", 0.0),
                "ytd_anterior": med.get("ytd_anterior", 0.0),
                "meta_ytd": med.get("meta_ytd", 0.0),
                "ytd_pct": med.get("ytd_pct"),
                "mom": None if med.get("mom") is None else round(med["mom"], 1),
                "yoy": None if med.get("yoy") is None else round(med["yoy"], 1),
                "ytd_yoy": None if med.get("ytd_yoy") is None else round(med["ytd_yoy"], 1),
            })

        return jsonify({"success": True, "data": equipes, "contexto": contexto})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})


@app.route('/api/ai-agent/chat', methods=['POST'])
def api_ai_agent_chat():
    try:
        body = request.get_json(force=True, silent=True) or {}
        user_message = body.get('message', '').strip()
        client_context = body.get('context', {})

        if not user_message:
            return jsonify({'success': False, 'error': 'Mensagem vazia'}), 400

        now_dt = datetime.now()
        mes = int(client_context.get('mes', now_dt.month))
        ano = int(client_context.get('ano', now_dt.year))
        if ano >= now_dt.year and mes > now_dt.month:
            mes = now_dt.month

        # Contexto enriquecido com dados reais do dashboard
        painel_data = obter_dados_painel(mes, ano)
        empresa_kpi = painel_data.get('EMPRESA', {}) if isinstance(painel_data, dict) else {}
        
        canais_resumo = {}
        if isinstance(painel_data, dict):
            for c in CANAIS_PAINEL:
                d = painel_data.get(c, {})
                canais_resumo[c] = {
                    "realizado_rs": round(d.get("realizado", 0.0), 2),
                    "meta_rs": round(d.get("meta", 0.0), 2),
                    "atingimento_pct": d.get("percentual", 0.0)
                }

        full_context = {
            "periodo_referencia": f"{mes:02d}/{ano}",
            "pagina_atual": client_context.get("pagina", "Dashboard TV"),
            "faturamento_empresa": {
                "realizado_rs": round(empresa_kpi.get("realizado", 0.0), 2),
                "meta_rs": round(empresa_kpi.get("meta", 0.0), 2),
                "atingimento_pct": empresa_kpi.get("percentual", 0.0)
            },
            "canais": canais_resumo
        }

        # Fluxo integrado: TypeSafe Jev (Decisão) -> GPT-4o-mini (Execução e Resposta)
        result = mqia_agent.run(user_message, context=full_context)

        return jsonify({
            'success': True,
            'decision': result.get('decisao_typesafe_jev', {}),
            'response': result.get('resposta_gpt4o_mini', '')
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/auditoria_medidas')
def api_auditoria_medidas():
    """Laudo de auditoria: mostra os intervalos e valores-base de cada medida.

    Permite conferir na tela, canal a canal, de onde saiu cada percentual.
    """
    try:
        now_dt = datetime.now()
        mes = int(request.args.get('mes', now_dt.month))
        ano = int(request.args.get('ano', now_dt.year))
        if ano >= now_dt.year and mes > now_dt.month:
            mes = now_dt.month
        medidas, contexto = calcular_medidas_tempo_canais(mes, ano)
        return jsonify({"success": True, "contexto": contexto, "medidas": medidas})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})


@app.route('/acumulado')
def dashboard_acumulado():
    return render_template('acumulado.html')

@app.route('/canais')
def dashboard_canais():
    return render_template('canais.html')

@app.route('/api/acumulado_tv')
def api_acumulado_tv():
    try:
        force = request.args.get('refresh') in ('1', 'true', 'True') or request.args.get('force') in ('1', 'true', 'True')
        now_dt = datetime.now()
        mes = int(request.args.get('mes', now_dt.month))
        ano = int(request.args.get('ano', now_dt.year))
        if ano >= now_dt.year and mes > now_dt.month:
            mes = now_dt.month
        
        if force:
            invalidar_todos_os_caches(ano)
            
        setores = [
            "VAREJO ESPECIALIZADO - SP",
            "VAREJO ESPECIALIZADO REG.",
            "DISTRIBUIÇÃO",
            "COMEX",
            "E-COMMERCE",
            "E-COMMERCE - PARLUX",
            "EMPRESA"
        ]
        
        historico_mensal = []
        ytd_por_setor = {setor: {"realizado": 0.0, "meta": 0.0} for setor in setores}
        
        for m in range(1, mes + 1):
            dados_mes = obter_dados_painel(m, ano, force_refresh=force)
            
            mensal = {}
            for setor in setores:
                dados_setor = dados_mes.get(setor, {"percentual": 0, "realizado": 0, "meta": 0})
                mensal[setor] = dados_setor["percentual"]
                
                ytd_por_setor[setor]["realizado"] += dados_setor["realizado"]
                ytd_por_setor[setor]["meta"] += dados_setor["meta"]
                
            historico_mensal.append({
                "mes": m,
                "dados": mensal
            })
            
        equipes = []
        for setor in setores:
            historico_setor = [{"mes": m, "percentual": historico_mensal[m-1]["dados"][setor]} for m in range(1, mes + 1)]
            
            real_ytd = ytd_por_setor[setor]["realizado"]
            meta_ytd = ytd_por_setor[setor]["meta"]
            pct_ytd = round((real_ytd / meta_ytd * 100), 1) if meta_ytd > 0 else 0.0
            
            display_name = "E-COMMERCE - MQ" if setor == "E-COMMERCE" else setor
            equipes.append({
                "name": display_name,
                "history": historico_setor,
                "percent_ytd": pct_ytd,
                "realizado_ytd": real_ytd,
                "meta_ytd": meta_ytd
            })
            
        return jsonify({"success": True, "data": equipes})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})


@app.route('/api/canais_trimestre_tv')
def api_canais_trimestre_tv():
    try:
        force = request.args.get('refresh') in ('1', 'true', 'True') or request.args.get('force') in ('1', 'true', 'True')
        ano = int(request.args.get('ano', datetime.now().year))
        
        if force:
            invalidar_todos_os_caches(ano)

        dados_meses = {}
        for m in range(1, 13):
            dados_meses[m] = obter_dados_painel(m, ano, force_refresh=force)

        trimestres = {
            "T1": {"nome": "1º Trimestre", "meses": [1, 2, 3]},
            "T2": {"nome": "2º Trimestre", "meses": [4, 5, 6]},
            "T3": {"nome": "3º Trimestre", "meses": [7, 8, 9]},
            "T4": {"nome": "4º Trimestre", "meses": [10, 11, 12]},
        }

        canais = [
            "VAREJO ESPECIALIZADO - SP", 
            "VAREJO ESPECIALIZADO REG.", 
            "DISTRIBUIÇÃO",
            "COMEX", 
            "E-COMMERCE", 
            "E-COMMERCE - PARLUX"
        ]

        resultado = {}
        for canal in canais:
            display_name = "E-COMMERCE - MQ" if canal == "E-COMMERCE" else canal
            resultado[display_name] = {}
            for tri_key, tri_info in trimestres.items():
                real_t = 0.0
                meta_t = 0.0
                for m in tri_info["meses"]:
                    d = dados_meses[m].get(canal, {})
                    if not d and canal == "E-COMMERCE":
                        d = dados_meses[m].get("E-COMMERCE - MQ", {})
                    real_t += d.get("realizado", 0.0)
                    meta_t += d.get("meta", 0.0)

                pct_t = round((real_t / meta_t * 100), 1) if meta_t > 0 else 0.0
                diff_t = round(pct_t - 100.0, 1)
                resultado[display_name][tri_key] = {
                    "titulo": f"{display_name} ({tri_info['nome'].upper()})",
                    "realizado": round(real_t, 2),
                    "meta": round(meta_t, 2),
                    "percent": pct_t,
                    "diff": diff_t
                }

        # Agrupamento também por Trimestre (T1, T2, T3, T4) para compatibilidade direta com views
        payload = {
            "by_canal": resultado,
            "T1": [],
            "T2": [],
            "T3": [],
            "T4": []
        }
        for tri_key in ["T1", "T2", "T3", "T4"]:
            for canal in canais:
                display_name = "E-COMMERCE - MQ" if canal == "E-COMMERCE" else canal
                info = resultado[display_name][tri_key]
                payload[tri_key].append({
                    "name": display_name,
                    "realizado": info["realizado"],
                    "meta": info["meta"],
                    "percent": info["percent"],
                    "diff": info["diff"],
                    "titulo": info["titulo"]
                })
                # Mantém chave direta no payload
                if display_name not in payload:
                    payload[display_name] = resultado[display_name]

        return jsonify({"success": True, "data": payload})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})


@app.route('/trimestre')
def dashboard_trimestre():
    return render_template('trimestre.html')

@app.route('/api/trimestre_tv')
def api_trimestre_tv():
    try:
        force = request.args.get('refresh') in ('1', 'true', 'True') or request.args.get('force') in ('1', 'true', 'True')
        now_dt = datetime.now()
        mes = int(request.args.get('mes', now_dt.month))
        ano = int(request.args.get('ano', now_dt.year))
        if ano >= now_dt.year and mes > now_dt.month:
            mes = now_dt.month
        
        if force:
            invalidar_todos_os_caches(ano)
            
        # 1º Trimestre: Jan, Fev, Mar (1, 2, 3)
        real_t1 = 0.0
        meta_t1 = 0.0
        for m in [1, 2, 3]:
            d = obter_dados_painel(m, ano, force_refresh=force).get("EMPRESA", {"realizado": 0.0, "meta": 0.0})
            real_t1 += d["realizado"]
            meta_t1 += d["meta"]
        pct_t1 = round((real_t1 / meta_t1 * 100), 1) if meta_t1 > 0 else 0.0
        diff_t1 = round(pct_t1 - 100.0, 1)

        # 2º Trimestre: Abr, Mai, Jun (4, 5, 6)
        real_t2 = 0.0
        meta_t2 = 0.0
        for m in [4, 5, 6]:
            d = obter_dados_painel(m, ano, force_refresh=force).get("EMPRESA", {"realizado": 0.0, "meta": 0.0})
            real_t2 += d["realizado"]
            meta_t2 += d["meta"]
        pct_t2 = round((real_t2 / meta_t2 * 100), 1) if meta_t2 > 0 else 0.0
        diff_t2 = round(pct_t2 - 100.0, 1)

        # 3º Trimestre: Jul, Ago, Set (7, 8, 9)
        real_t3 = 0.0
        meta_t3 = 0.0
        for m in [7, 8, 9]:
            d = obter_dados_painel(m, ano, force_refresh=force).get("EMPRESA", {"realizado": 0.0, "meta": 0.0})
            real_t3 += d["realizado"]
            meta_t3 += d["meta"]
        pct_t3 = round((real_t3 / meta_t3 * 100), 1) if meta_t3 > 0 else 0.0
        diff_t3 = round(pct_t3 - 100.0, 1)

        # Mês Atual: mes selecionado
        d_atual = obter_dados_painel(mes, ano, force_refresh=force).get("EMPRESA", {"realizado": 0.0, "meta": 0.0, "percentual": 0.0})
        pct_atual = round(d_atual["percentual"], 1)
        diff_atual = round(pct_atual - 100.0, 1)

        # Semestre / Acumulado YTD: 1 até mes
        real_sem = 0.0
        meta_sem = 0.0
        for m in range(1, mes + 1):
            d = obter_dados_painel(m, ano, force_refresh=force).get("EMPRESA", {"realizado": 0.0, "meta": 0.0})
            real_sem += d["realizado"]
            meta_sem += d["meta"]
        pct_sem = round((real_sem / meta_sem * 100), 1) if meta_sem > 0 else 0.0
        diff_sem = round(pct_sem - 100.0, 1)

        cards = [
            {
                "id": "gauge-0",
                "title": "EMPRESA (1º TRIMESTRE)",
                "percent": pct_t1,
                "diff": diff_t1,
                "realizado": real_t1,
                "meta": meta_t1
            },
            {
                "id": "gauge-1",
                "title": "EMPRESA (2º TRIMESTRE)",
                "percent": pct_t2,
                "diff": diff_t2,
                "realizado": real_t2,
                "meta": meta_t2
            },
            {
                "id": "gauge-2",
                "title": "EMPRESA (3º TRIMESTRE)",
                "percent": pct_t3,
                "diff": diff_t3,
                "realizado": real_t3,
                "meta": meta_t3
            },
            {
                "id": "gauge-3",
                "title": "EMPRESA (MES ATUAL)",
                "percent": pct_atual,
                "diff": diff_atual,
                "realizado": d_atual.get("realizado", 0.0),
                "meta": d_atual.get("meta", 0.0)
            },
            {
                "id": "gauge-4",
                "title": "EMPRESA",
                "percent": pct_sem,
                "diff": diff_sem,
                "realizado": real_sem,
                "meta": meta_sem
            }
        ]
        
        return jsonify({"success": True, "data": cards})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})

@app.route('/empresa')
def dashboard_empresa():
    return render_template('empresa.html')

@app.route('/api/empresa_tv')
def api_empresa_tv():
    try:
        force = request.args.get('refresh') in ('1', 'true', 'True') or request.args.get('force') in ('1', 'true', 'True')
        ano = int(request.args.get('ano', datetime.now().year))
        meses_param = request.args.get('meses') or request.args.get('mes')
        
        if force:
            invalidar_todos_os_caches(ano)
            
        if meses_param:
            if ',' in str(meses_param):
                meses_list = [int(m.strip()) for m in str(meses_param).split(',') if m.strip().isdigit() and 1 <= int(m.strip()) <= 12]
            else:
                m_single = int(meses_param)
                # Se for um único mês (ex: mes=12), no contexto corporativo representa o acumulado de 1 até aquele mês
                meses_list = list(range(1, m_single + 1))
        else:
            meses_list = list(range(1, datetime.now().month + 1))

        if not meses_list:
            meses_list = list(range(1, datetime.now().month + 1))

        now = datetime.now()
        # Se for o ano corrente, não acumular meses estritamente futuros que ainda não possuem faturamento
        if ano == now.year:
            meses_validos = [m for m in meses_list if m <= now.month]
            if meses_validos:
                meses_list = meses_validos
            else:
                meses_list = list(range(1, now.month + 1))
            
        meses_list.sort()

        ref_mes = meses_list[-1]
        d_ref = obter_dados_painel(ref_mes, ano, force_refresh=force).get("EMPRESA", {"realizado": 0.0, "meta": 0.0, "percentual": 0.0})
        
        real_sel = 0.0
        meta_sel = 0.0
        for m in meses_list:
            d = obter_dados_painel(m, ano, force_refresh=force).get("EMPRESA", {"realizado": 0.0, "meta": 0.0})
            real_sel += d["realizado"]
            meta_sel += d["meta"]

        pct_sel = round((real_sel / meta_sel * 100), 1) if meta_sel > 0 else 0.0
        diff_sel = round(pct_sel - 100.0, 1)

        # 1. ACUMULADO (PERÍODO): Soma dos meses selecionados no filtro
        pct_acum = pct_sel
        diff_acum = diff_sel
        real_acum = real_sel
        meta_acum = meta_sel

        real_sel_ant = 0.0
        meta_sel_ant = 0.0
        for m in meses_list:
            d_ant = obter_dados_painel(m, ano - 1, force_refresh=force).get("EMPRESA", {"realizado": 0.0, "meta": 0.0})
            real_sel_ant += d_ant.get("realizado", 0.0)
            meta_sel_ant += d_ant.get("meta", 0.0)
        pct_sel_ant = round((real_sel_ant / meta_sel_ant * 100), 1) if meta_sel_ant > 0 else 0.0
        yoy_acum = mt.arredondar(mt.divide_seguro(real_sel, real_sel_ant), 1)

        # 2. MÊS ATUAL:
        # Se for o ano corrente (2026), o mês atual é SEMPRE o mês de hoje (Outubro / 10), com dados reais!
        if ano == now.year:
            mes_atual = now.month
        else:
            mes_atual = ref_mes if ref_mes else 12

        d_mes_atual_all = obter_dados_painel(mes_atual, ano, force_refresh=force)
        d_mes_atual = d_mes_atual_all.get("EMPRESA", {"realizado": 0.0, "meta": 0.0, "percentual": 0.0})
        pct_mes = round(d_mes_atual.get("percentual", 0.0), 1)
        diff_mes = round(pct_mes - 100.0, 1)
        real_mes = d_mes_atual.get("realizado", 0.0)
        meta_mes = d_mes_atual.get("meta", 0.0)
        gap_mes = max(0.0, meta_mes - real_mes)
        gap_pct_mes = max(0.0, 100.0 - pct_mes)

        mes_ant_m = 12 if mes_atual == 1 else mes_atual - 1
        ano_ant_m = ano - 1 if mes_atual == 1 else ano
        d_mes_ant = obter_dados_painel(mes_ant_m, ano_ant_m, force_refresh=force).get("EMPRESA", {"realizado": 0.0, "meta": 0.0, "percentual": 0.0})
        d_ano_ant = obter_dados_painel(mes_atual, ano - 1, force_refresh=force).get("EMPRESA", {"realizado": 0.0, "meta": 0.0, "percentual": 0.0})

        real_ant_m = d_mes_ant.get("realizado", 0.0)
        real_ant_y = d_ano_ant.get("realizado", 0.0)
        mom_mes = mt.arredondar(mt.divide_seguro(real_mes, real_ant_m), 1)
        yoy_mes = mt.arredondar(mt.divide_seguro(real_mes, real_ant_y), 1)

        # Cálculo de dias úteis e ritmo diário (% e R$)
        _, total_dias_mes = calendar.monthrange(ano, mes_atual)
        if ano == now.year and mes_atual == now.month:
            hoje_dia = min(now.day, total_dias_mes)
            dias_uteis_restantes = sum(1 for d in range(hoje_dia, total_dias_mes + 1) if date(ano, mes_atual, d).weekday() < 5)
        elif (ano < now.year) or (ano == now.year and mes_atual < now.month):
            dias_uteis_restantes = 0
        else:
            dias_uteis_restantes = sum(1 for d in range(1, total_dias_mes + 1) if date(ano, mes_atual, d).weekday() < 5)

        dias_uteis_calc = max(1, dias_uteis_restantes)
        ritmo_diario_mes = round(gap_mes / dias_uteis_calc, 2) if (gap_mes > 0 and dias_uteis_restantes > 0) else 0.0
        ritmo_diario_pct = round(gap_pct_mes / dias_uteis_calc, 2) if (gap_pct_mes > 0 and dias_uteis_restantes > 0) else 0.0

        # Contribuição dos canais (Mês Atual)
        canais_nomes_curtos = {
            "E-COMMERCE": "E-commerce MQ",
            "DISTRIBUIÇÃO": "Distribuição",
            "COMEX": "Comex",
            "VAREJO ESPECIALIZADO - SP": "Varejo SP",
            "VAREJO ESPECIALIZADO REG.": "Varejo Reg",
            "E-COMMERCE - PARLUX": "Parlux"
        }
        canais_cores = {
            "E-COMMERCE": "#0d6efd",
            "DISTRIBUIÇÃO": "#198754",
            "COMEX": "#ffc107",
            "VAREJO ESPECIALIZADO - SP": "#20c997",
            "VAREJO ESPECIALIZADO REG.": "#d63384",
            "E-COMMERCE - PARLUX": "#6f42c1"
        }

        canais_contribuicao_mes = []
        for canal in CANAIS_PAINEL:
            if canal == "EMPRESA" or canal == "E-COMMERCE - MQ":
                continue
            dc = d_mes_atual_all.get(canal, {"realizado": 0.0, "meta": 0.0, "percentual": 0.0})
            r_c = dc.get("realizado", 0.0)
            p_c = dc.get("percentual", 0.0)
            share_c = round((r_c / real_mes * 100), 1) if real_mes > 0 else 0.0
            canais_contribuicao_mes.append({
                "canal": canal,
                "nome": canais_nomes_curtos.get(canal, canal),
                "cor": canais_cores.get(canal, "#888888"),
                "realizado": r_c,
                "percentual": p_c,
                "meta": dc.get("meta", 0.0),
                "share": share_c
            })
        canais_contribuicao_mes.sort(key=lambda x: x["realizado"], reverse=True)

        # Contribuição dos canais (Acumulado)
        gap_acum = max(0.0, meta_acum - real_acum)
        canais_contribuicao_acum = []
        for canal in CANAIS_PAINEL:
            if canal == "EMPRESA" or canal == "E-COMMERCE - MQ":
                continue
            r_tot = 0.0
            m_tot = 0.0
            for m in meses_list:
                dc = obter_dados_painel(m, ano, force_refresh=force).get(canal, {"realizado": 0.0, "meta": 0.0})
                r_tot += dc.get("realizado", 0.0)
                m_tot += dc.get("meta", 0.0)
            pct_tot = round((r_tot / m_tot * 100), 1) if m_tot > 0 else 0.0
            share_tot = round((r_tot / real_acum * 100), 1) if real_acum > 0 else 0.0
            canais_contribuicao_acum.append({
                "canal": canal,
                "nome": canais_nomes_curtos.get(canal, canal),
                "cor": canais_cores.get(canal, "#888888"),
                "realizado": r_tot,
                "percentual": pct_tot,
                "meta": m_tot,
                "share": share_tot
            })
        canais_contribuicao_acum.sort(key=lambda x: x["realizado"], reverse=True)

        return jsonify({
            "success": True,
            "data": {
                "mes": {
                    "percent": pct_mes,
                    "diff": diff_mes,
                    "realizado": real_mes,
                    "meta": meta_mes,
                    "gap": gap_mes,
                    "gap_pct": gap_pct_mes,
                    "dias_uteis_restantes": dias_uteis_restantes,
                    "ritmo_diario": ritmo_diario_mes,
                    "ritmo_diario_pct": ritmo_diario_pct,
                    "prev_month_percent": d_mes_ant.get("percentual", 0.0),
                    "prev_year_percent": d_ano_ant.get("percentual", 0.0),
                    "mom": mom_mes,
                    "yoy": yoy_mes,
                    "atingiu_meta": pct_mes >= 100.0,
                    "canais": canais_contribuicao_mes
                },
                "acumulado": {
                    "percent": pct_acum,
                    "diff": diff_acum,
                    "realizado": real_acum,
                    "meta": meta_acum,
                    "gap": gap_acum,
                    "gap_pct": max(0.0, 100.0 - pct_acum),
                    "prev_year_percent": pct_sel_ant,
                    "yoy": yoy_acum,
                    "atingiu_meta": pct_acum >= 100.0,
                    "canais": canais_contribuicao_acum
                }
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})

@app.route('/reg_distribuicao')
def dashboard_reg_dist():
    return redirect('/todos_canais')

@app.route('/comex_ecommerce')
def dashboard_comex_ecom():
    return redirect('/todos_canais')

@app.route('/todos_canais')
def dashboard_todos_canais():
    return render_template('todos_canais.html')

@app.route('/diario_canal')
def dashboard_diario_canal():
    return render_template('diario_canal.html')

@app.route('/diario_marcas')
def dashboard_diario_marcas():
    return render_template('diario_marcas.html')

@app.route('/categorias')
def categorias():
    return render_template('categorias.html')

@app.route('/marcas')
def marcas():
    return render_template('marcas.html')

@app.route('/canais_vendas')
def canais_vendas():
    return render_template('canais_vendas.html')


@app.route('/api/canal_dados')
def api_canal_dados():
    try:
        now = datetime.now()
        ultimo_fechado = now.month - 1 if now.month > 1 else 12
        mes_arg = request.args.get('mes')
        mes = int(mes_arg) if mes_arg and mes_arg.isdigit() else ultimo_fechado
        ano = int(request.args.get('ano', now.year))
        canal = request.args.get('canal')
        marca_arg = request.args.get('marca')
        force = request.args.get('refresh') in ('1', 'true', 'True') or request.args.get('force') in ('1', 'true', 'True')
        
        map_canais = {
            'distribuicao': 'DISTRIBUIÇÃO',
            'ecommerce_mq': 'E-COMMERCE - MQ',
            'varejo_sp': 'VAREJO ESPECIALIZADO - SP',
            'comex': 'COMEX',
            'regional_no_nd': 'REGIONAL NO - ND',
            'ecommerce_parlux': 'E-COMMERCE - PARLUX',
            'regional_rj_mg_es': 'REGIONAL RJ - MG - ES',
            'regional_sul': 'REGIONAL SUL'
        }
        if canal in map_canais:
            canal = map_canais[canal]
        elif canal:
            canal_clean = canal.strip().upper()
            if 'DISTRIB' in canal_clean:
                canal = 'DISTRIBUIÇÃO'
            elif 'PARLUX' in canal_clean:
                canal = 'E-COMMERCE - PARLUX'
            elif 'ECOMMERCE' in canal_clean or 'E-COMMERCE' in canal_clean:
                canal = 'E-COMMERCE - MQ'
            elif 'SP' in canal_clean or 'VAREJO' in canal_clean:
                canal = 'VAREJO ESPECIALIZADO - SP'
            elif 'COMEX' in canal_clean:
                canal = 'COMEX'
            elif 'SUL' in canal_clean:
                canal = 'REGIONAL SUL'
            elif 'NO' in canal_clean or 'ND' in canal_clean:
                canal = 'REGIONAL NO - ND'
            elif 'RJ' in canal_clean or 'MG' in canal_clean or 'ES' in canal_clean:
                canal = 'REGIONAL RJ - MG - ES'
        
        if force:
            cached_categorias_data.clear()
            cached_cat_raw_df.clear()
            
        data = obter_dados_categorias_marcas(mes, ano, canal_filter=canal, marca_filter=marca_arg, force_refresh=force)
        return jsonify({"success": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})

@app.route('/canal/<canal_name>')
def canal_page(canal_name):
    # Map friendly URL names to actual DB names
    map_canais = {
        'distribuicao': 'DISTRIBUIÇÃO',
        'ecommerce_mq': 'E-COMMERCE - MQ',
        'varejo_sp': 'VAREJO ESPECIALIZADO - SP',
        'comex': 'COMEX',
        'regional_no_nd': 'REGIONAL NO - ND',
        'ecommerce_parlux': 'E-COMMERCE - PARLUX',
        'regional_rj_mg_es': 'REGIONAL RJ - MG - ES',
        'regional_sul': 'REGIONAL SUL'
    }
    
    canal_db = map_canais.get(canal_name, '')
    return render_template('canal.html', canal_db=canal_db, canal_id=canal_name)

@app.route('/paises')
def paises():
    return render_template('paises.html')

@app.route('/estoque_previsao')
def estoque_previsao():
    return render_template('estoque_previsao.html')

@app.route('/estoque')
def estoque():
    return render_template('estoque_previsao.html')

@app.route('/teste_estoque')
@app.route('/teste_estoque_previsao')
def teste_estoque():
    return render_template('teste_estoque.html')

@app.route('/tv-alertas')
def tv_alertas():
    return render_template('tv_alertas.html')

cached_categorias_data = {}
cached_cat_raw_df = {}

def obter_dados_categorias_marcas(mes, ano, canal_filter=None, marca_filter=None, force_refresh=False):
    cache_key = f"{ano}_{mes}_{canal_filter}_{marca_filter}"
    now_ts = time.time()
    if not force_refresh and cache_key in cached_categorias_data:
        data, ts = cached_categorias_data[cache_key]
        if now_ts - ts < CACHE_TTL_HEAVY:
            return data

    now = datetime.now()
    if not mes or mes < 1 or mes > 12:
        mes_ref = now.month - 1 if now.month > 1 else 12
    else:
        mes_ref = mes
    ano_ref = ano

    mes_ant = 12 if mes_ref == 1 else mes_ref - 1
    ano_ant = ano_ref - 1 if mes_ref == 1 else ano_ref
    ano_yoy = ano_ref - 1

    months_6 = []
    nomes_meses_br = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    curr_m, curr_a = mes_ref, ano_ref
    for _ in range(6):
        months_6.append((curr_a, curr_m))
        curr_m -= 1
        if curr_m == 0:
            curr_m = 12
            curr_a -= 1
    months_6.reverse()
    labels_6m = [f"{nomes_meses_br[m]}/{str(a)[2:]}" for a, m in months_6]

    df = None
    if not force_refresh and ano_ref in cached_cat_raw_df:
        df_cached, ts_raw = cached_cat_raw_df[ano_ref]
        if now_ts - ts_raw < CACHE_TTL_HEAVY:
            df = df_cached.copy()

    disk_file = os.path.join(DISK_CACHE_DIR, f'cat_raw_{ano_ref}.pkl')
    if df is None and not force_refresh and os.path.exists(disk_file):
        file_age = now_ts - os.path.getmtime(disk_file)
        if file_age < CACHE_TTL_HEAVY:
            try:
                df = pd.read_pickle(disk_file)
                cached_cat_raw_df[ano_ref] = (df.copy(), now_ts)
            except Exception as e:
                print(f"[CACHE DISCO] Erro ao carregar arquivo de cache {disk_file}: {e}")

    if df is None:
        dt_ini = f"01/01/{ano_ref - 1}"
        dt_fim = f"31/12/{ano_ref}"

        d_filter = f"TGFCAB.DTENTSAI >= TO_DATE('{dt_ini}', 'DD/MM/YYYY') AND TGFCAB.DTENTSAI <= TO_DATE('{dt_fim}', 'DD/MM/YYYY') AND "
        opt_sql = RAW_SQL_BASE.replace('WHERE TGFCAB.CODTIPOPER = TGFTOP.CODTIPOPER', 'WHERE ' + d_filter + 'TGFCAB.CODTIPOPER = TGFTOP.CODTIPOPER')
        opt_sql = opt_sql.replace("WHERE tgfcab.tipmov='P'", 'WHERE ' + d_filter + "tgfcab.tipmov='P'")

        query = f"""
        SELECT 
            TRUNC(V.DTENTSAI) AS DATA,
            TO_NUMBER(TO_CHAR(V.DTENTSAI, 'YYYY')) AS ANO,
            TO_NUMBER(TO_CHAR(V.DTENTSAI, 'MM')) AS MES,
            V.CODVEND,
            NVL(TRIM(P.GRUPO_PAI), 'OUTROS') AS GRUPO_PAI,
            NVL(TRIM(P.GRUPO_SINTETICO), 'OUTROS') AS GRUPO_SINTETICO,
            NVL(TRIM(P.GRUPO_ANALITICO), 'OUTROS') AS GRUPO_ANALITICO,
            NVL(TRIM(P.MARCA), 'OUTRAS') AS MARCA,
            NVL(TRIM(P.DESCRPROD), 'OUTROS') AS PRODUTO,
            SUM(V.TotalPrevisto) AS TOTAL_PREV,
            SUM(V.TotalFat) AS TOTAL_FAT
        FROM ({opt_sql}) V
        LEFT JOIN VW_MQ_TGFPRO_POWER_BI P ON TO_CHAR(V.codprod) = TO_CHAR(P.CODPROD)
        GROUP BY TRUNC(V.DTENTSAI), TO_NUMBER(TO_CHAR(V.DTENTSAI, 'YYYY')), TO_NUMBER(TO_CHAR(V.DTENTSAI, 'MM')), V.CODVEND, NVL(TRIM(P.GRUPO_PAI), 'OUTROS'), NVL(TRIM(P.GRUPO_SINTETICO), 'OUTROS'), NVL(TRIM(P.GRUPO_ANALITICO), 'OUTROS'), NVL(TRIM(P.MARCA), 'OUTRAS'), NVL(TRIM(P.DESCRPROD), 'OUTROS')
        """

        conn = get_db_connection()
        try:
            df = pd.read_sql(query, conn)
        finally:
            conn.close()

        df['DATA'] = pd.to_datetime(df['DATA'], errors='coerce')
        df['TOTAL_PREV'] = pd.to_numeric(df['TOTAL_PREV'], errors='coerce').fillna(0.0)
        df['PRODUTO'] = df['GRUPO_ANALITICO'].where(
            (df['GRUPO_ANALITICO'] != 'OUTROS') & (df['GRUPO_ANALITICO'] != '') & (df['GRUPO_ANALITICO'].notna()),
            df['PRODUTO']
        )

        def _mapear_cat_row(row):
            marca = str(row.get('MARCA', '')).upper()
            gp_pai = str(row.get('GRUPO_PAI', '')).upper()
            gp_sint = str(row.get('GRUPO_SINTETICO', '')).upper()
            gp_anal = str(row.get('GRUPO_ANALITICO', '')).upper()
            descr = str(row.get('PRODUTO', '')).upper()

            if 'SPARE' in gp_pai or 'SPARE' in gp_sint or marca.startswith('SP ') or 'SPARE PARTS' in gp_anal or ' - SP' in descr:
                return 'Spare Parts'
            if 'PARLUX' in marca or 'PARLUX' in descr or 'PARLUX' in gp_anal:
                return 'Parlux'
            if 'ESCOVA ELETRICA' in gp_sint or 'SECADORA' in descr or 'TRISCOVA' in descr or 'LIZIN' in descr or 'ESCOVA ALISADORA' in descr:
                return 'Escova Secadora'
            if 'ESCOVA' in gp_pai or 'ESCOVA' in gp_sint or 'ESCOVA' in gp_anal or 'ESCOVA' in descr:
                return 'Escova Uso Diário'
            if 'PRANCHA' in gp_sint or 'PRANCHA' in gp_anal or 'PRANCHA' in descr:
                return 'Prancha'
            if 'SECADOR' in gp_sint or 'SECADOR' in gp_anal or 'SECADOR' in descr:
                return 'Secador'
            if 'MODELADOR' in gp_sint or 'MODELADOR' in gp_anal or 'MODELADOR' in descr:
                return 'Modelador'
            if 'MAQUINA' in gp_sint or 'MAQUINA' in gp_anal or 'MAQUINA' in descr or 'BARBER' in gp_sint or 'BARBER' in gp_anal:
                return 'Maquina'
            if 'TESOURA' in gp_sint or 'TESOURA' in gp_anal or 'TESOURA' in descr or 'TESOURA' in marca or descr.startswith('TES '):
                return 'Tesoura'
            return 'Outros'

        df['CATEGORIA'] = df.apply(_mapear_cat_row, axis=1)

        _, df_setores = carregar_metas_e_setores(mes_ref, ano_ref)
        df_setores_clean = df_setores[['CODVEND', 'SETOR']].drop_duplicates(subset=['CODVEND'])
        df = pd.merge(df, df_setores_clean, on='CODVEND', how='left')

        def _mapear_canal_row(row):
            setor = str(row.get('SETOR', '')).strip().upper()
            marca = str(row.get('MARCA', '')).strip().upper()
            if setor == 'SP':
                return 'VAREJO ESPECIALIZADO - SP'
            elif setor in ['NO - ND', 'RJ - MG - ES', 'SUL']:
                return f'REGIONAL {setor}'
            elif 'DISTRIB' in setor or 'VAGNER' in setor:
                return 'DISTRIBUIÇÃO'
            elif setor == 'COMEX':
                return 'COMEX'
            elif 'E-COMMERCE' in setor or 'ECOMMERCE' in setor:
                if 'PARLUX' in marca:
                    return 'E-COMMERCE - PARLUX'
                else:
                    return 'E-COMMERCE - MQ'
            return 'OUTROS'

        df['CANAL'] = df.apply(_mapear_canal_row, axis=1)
        cached_cat_raw_df[ano_ref] = (df.copy(), now_ts)
        try:
            df.to_pickle(disk_file)
        except Exception as e:
            print(f"[CACHE DISCO] Erro ao salvar arquivo de cache {disk_file}: {e}")

    if canal_filter:
        df = df[df['CANAL'] == canal_filter].copy()

    if marca_filter and str(marca_filter).strip().upper() not in ('TODAS', '', 'NONE', 'NULL'):
        if ',' in str(marca_filter):
            m_list = [m.strip().upper() for m in str(marca_filter).split(',') if m.strip()]
            df = df[df['MARCA'].str.upper().isin(m_list)].copy()
        else:
            df = df[df['MARCA'].str.upper() == str(marca_filter).strip().upper()].copy()

    corte_pg = mt.data_corte_contexto(mes_ref, ano_ref)
    parcial_pg = mt.mes_esta_parcial(corte_pg)

    # Período YTD cortado no mesmo dia útil/equivalente do ano anterior quando o mês for parcial
    periodos_pg = {
        "mtd": mt.periodo_mes_atual(corte_pg),
        "mes_anterior": mt.periodo_mes_anterior(corte_pg, parcial_pg),
        "mes_ano_anterior": mt.periodo_ano_anterior_mes(corte_pg, parcial_pg),
        "ytd": mt.periodo_ytd(corte_pg),
        "ytd_anterior": mt.periodo_ytd_ano_anterior(corte_pg, parcial_pg),
    }

    def calcular_dimensao(dim_col):
        def extrair_totais(mask, chaves_group):
            if not mask.any():
                return {}, 0.0
            grp = df[mask].groupby(chaves_group)['TOTAL_PREV'].sum()
            return grp.to_dict(), float(grp.sum())

        pai_vals = {}
        pai_tots = {}
        filho_vals = {}
        filho_tots = {}

        for chave, (ini_p, fim_p) in periodos_pg.items():
            m = (df['DATA'].dt.date >= ini_p) & (df['DATA'].dt.date <= fim_p)
            pai_vals[chave], pai_tots[chave] = extrair_totais(m, [dim_col])
            filho_vals[chave], filho_tots[chave] = extrair_totais(m, [dim_col, 'PRODUTO'])

        total_ytd = pai_tots["ytd"]
        total_ytd_ant = pai_tots["ytd_anterior"]

        if dim_col == 'CATEGORIA':
            padrao_cats = ['Prancha', 'Secador', 'Modelador', 'Escova Uso Diário', 'Escova Secadora', 'Maquina', 'Parlux', 'Tesoura', 'Spare Parts', 'Outros']
            for c_nome in padrao_cats:
                if c_nome not in pai_vals["ytd"]:
                    pai_vals["ytd"][c_nome] = 0.0
                if c_nome not in pai_vals["ytd_anterior"]:
                    pai_vals["ytd_anterior"][c_nome] = 0.0

        ordenados_pai = sorted(pai_vals["ytd"].items(), key=lambda kv: kv[1], reverse=True)
        rank_atual_pai = {item: i + 1 for i, (item, _) in enumerate(ordenados_pai) if _ > 0}
        rank_ant_pai = {
            item: i + 1 for i, (item, _) in enumerate(
                sorted(pai_vals["ytd_anterior"].items(), key=lambda kv: kv[1], reverse=True)
            ) if _ > 0
        }

        linhas = []
        for pai_item, v_ytd in ordenados_pai:
            pai_item = str(pai_item)
            v_mtd = float(pai_vals["mtd"].get(pai_item, 0.0))
            v_mom = float(pai_vals["mes_anterior"].get(pai_item, 0.0))
            v_yoy = float(pai_vals["mes_ano_anterior"].get(pai_item, 0.0))
            v_ytd = float(v_ytd)
            v_ytd_ant = float(pai_vals["ytd_anterior"].get(pai_item, 0.0))

            rank = rank_atual_pai.get(pai_item, len(linhas) + 1)
            r_ant = rank_ant_pai.get(pai_item)
            delta_rank = (r_ant - rank) if (r_ant is not None and rank is not None) else None

            share = round(v_ytd / total_ytd * 100, 1) if total_ytd > 0 else 0.0
            share_ant = round(v_ytd_ant / total_ytd_ant * 100, 1) if total_ytd_ant > 0 else 0.0

            # Evolução percentual de um share para outro: ((share - share_ant) / share_ant * 100)
            if share_ant > 0:
                evolucao_share = round(((share - share_ant) / share_ant * 100), 1)
            elif share > 0:
                evolucao_share = None # Indicador de novo
            else:
                evolucao_share = 0.0

            mom = mt.arredondar(mt.divide_seguro(v_mtd, v_mom), 1)
            yoy = mt.arredondar(mt.divide_seguro(v_mtd, v_yoy), 1)
            ytd_yoy = mt.arredondar(mt.divide_seguro(v_ytd, v_ytd_ant), 1)

            if rank is not None and rank <= 2:
                status = "Líder"
            elif (ytd_yoy is not None and ytd_yoy >= 15.0) or (delta_rank is not None and delta_rank >= 2):
                status = "Expansão"
            elif (ytd_yoy is not None and ytd_yoy <= -15.0) or (delta_rank is not None and delta_rank <= -2):
                status = "Atenção"
            else:
                status = "Estável"

            filhos_deste_pai = []
            for (p_pai, p_filho), f_val_ytd in filho_vals["ytd"].items():
                if str(p_pai) == pai_item:
                    filhos_deste_pai.append((str(p_filho), float(f_val_ytd)))
            
            for (p_pai, p_filho), f_val_ytd_ant in filho_vals["ytd_anterior"].items():
                if str(p_pai) == pai_item:
                    f_str = str(p_filho)
                    if not any(f[0] == f_str for f in filhos_deste_pai):
                        filhos_deste_pai.append((f_str, 0.0))
            
            filhos_ordenados = sorted(filhos_deste_pai, key=lambda x: x[1], reverse=True)
            f_rank_atual = {item: i + 1 for i, (item, _) in enumerate(filhos_ordenados) if _ > 0}
            
            filhos_ant_ordenados = sorted(
                [(str(k[1]), v) for k, v in filho_vals["ytd_anterior"].items() if str(k[0]) == pai_item],
                key=lambda x: x[1], reverse=True
            )
            f_rank_ant = {item: i + 1 for i, (item, _) in enumerate(filhos_ant_ordenados)}

            produtos_linhas = []
            for filho_item, f_ytd in filhos_ordenados:
                if f_ytd == 0.0 and f_rank_ant.get(filho_item) is None:
                    continue
                    
                f_mtd = float(filho_vals["mtd"].get((pai_item, filho_item), 0.0))
                f_mom = float(filho_vals["mes_anterior"].get((pai_item, filho_item), 0.0))
                f_yoy = float(filho_vals["mes_ano_anterior"].get((pai_item, filho_item), 0.0))
                f_ytd_ant = float(filho_vals["ytd_anterior"].get((pai_item, filho_item), 0.0))
                
                f_r = f_rank_atual.get(filho_item)
                f_r_ant = f_rank_ant.get(filho_item)
                f_delta_rank = (f_r_ant - f_r) if (f_r_ant is not None and f_r is not None) else None

                f_share = round(f_ytd / total_ytd * 100, 1) if total_ytd > 0 else 0.0
                f_share_ant = round(f_ytd_ant / total_ytd_ant * 100, 1) if total_ytd_ant > 0 else 0.0
                
                if f_share_ant > 0:
                    f_evolucao_share = round(((f_share - f_share_ant) / f_share_ant * 100), 1)
                elif f_share > 0:
                    f_evolucao_share = None
                else:
                    f_evolucao_share = 0.0

                f_mom_pct = mt.arredondar(mt.divide_seguro(f_mtd, f_mom), 1)
                f_yoy_pct = mt.arredondar(mt.divide_seguro(f_mtd, f_yoy), 1)
                f_ytd_yoy_pct = mt.arredondar(mt.divide_seguro(f_ytd, f_ytd_ant), 1)

                if f_r is not None and f_r <= 2:
                    f_status = "Líder"
                elif (f_ytd_yoy_pct is not None and f_ytd_yoy_pct >= 15.0) or (f_delta_rank is not None and f_delta_rank >= 2):
                    f_status = "Expansão"
                elif (f_ytd_yoy_pct is not None and f_ytd_yoy_pct <= -15.0) or (f_delta_rank is not None and f_delta_rank <= -2):
                    f_status = "Atenção"
                else:
                    f_status = "Estável"

                produtos_linhas.append({
                    "item": filho_item,
                    "faturamento": f_ytd,
                    "faturamento_ant": f_ytd_ant,
                    "faturamento_mtd": f_mtd,
                    "mtd": f_mtd,
                    "mes_anterior": f_mom,
                    "mes_ano_anterior": f_yoy,
                    "rank": f_r,
                    "rank_ant": f_r_ant,
                    "share": f_share,
                    "share_ant": f_share_ant,
                    "var_pp": round(f_share - f_share_ant, 1),
                    "evolucao_share": f_evolucao_share,
                    "mom": f_mom_pct,
                    "yoy": f_yoy_pct,
                    "ytd_yoy": f_ytd_yoy_pct,
                    "status": f_status,
                })
                
            linhas.append({
                "item": pai_item,
                "faturamento": v_ytd,
                "faturamento_ant": v_ytd_ant,
                "faturamento_mtd": v_mtd,
                "mtd": v_mtd,
                "mes_anterior": v_mom,
                "mes_ano_anterior": v_yoy,
                "rank": rank,
                "rank_ant": r_ant,
                "share": share,
                "share_ant": share_ant,
                "var_pp": round(share - share_ant, 1),
                "evolucao_share": evolucao_share,
                "mom": mom,
                "yoy": yoy,
                "ytd_yoy": ytd_yoy,
                "status": status,
                "produtos": produtos_linhas
            })
            
        summary = {
            "lider": {"nome": "N/A", "faturamento": 0.0, "share": 0.0, "rank": 1},
            "top_growth": {"nome": "N/A", "mom": 0.0},
            "top_mover": {"nome": "N/A", "delta_rank": 0},
            "warning": {"nome": "N/A", "mom": 0.0}
        }
        return linhas, total_ytd, total_ytd_ant, summary
    cat_linhas, total_cat, total_cat_ant, cat_summary = calcular_dimensao('CATEGORIA')
    marca_linhas, total_marca, total_marca_ant, marca_summary = calcular_dimensao('MARCA')
    canal_linhas, total_canal, total_canal_ant, canal_summary = calcular_dimensao('CANAL')

    ordem_canais = [
        'VAREJO ESPECIALIZADO - SP',
        'REGIONAL RJ - MG - ES',
        'REGIONAL NO - ND',
        'REGIONAL SUL',
        'DISTRIBUIÇÃO',
        'COMEX',
        'E-COMMERCE - MQ',
        'E-COMMERCE - PARLUX'
    ]
    dict_canais = {c['item']: c for c in canal_linhas}
    canal_linhas_ordenado = []
    for c_nome in ordem_canais:
        if c_nome in dict_canais:
            canal_linhas_ordenado.append(dict_canais[c_nome])

    meses_colunas = [{"num": m, "label": nomes_meses_br[m]} for m in range(1, 13)]

    contexto_pg = {
        "corte": corte_pg.isoformat(),
        "parcial": parcial_pg,
        "dias": corte_pg.day,
        "periodos": {k: [v[0].isoformat(), v[1].isoformat()] for k, v in periodos_pg.items()},
    }

    resultado = {
        "mes": mes_ref,
        "ano": ano_ref,
        "mes_solicitado": mes,
        "mes_nome": nomes_meses_br[mes_ref],
        "meses_colunas": meses_colunas,
        "total_faturamento": round(total_cat, 2),
        "total_faturamento_ant": round(total_cat_ant, 2),
        "labels_6m": labels_6m,
        "categorias": cat_linhas,
        "marcas": marca_linhas,
        "canais": canal_linhas_ordenado,
        "canal": canal_filter,
        "contexto": contexto_pg,
        "summary_categoria": cat_summary,
        "summary_marca": marca_summary,
        "summary_canal": canal_summary
    }

    cached_categorias_data[cache_key] = (resultado, now_ts)
    return resultado

@app.route('/api/marcas_dados')
@app.route('/api/categorias_dados')
def api_categorias_dados():
    try:
        now = datetime.now()
        ultimo_fechado = now.month - 1 if now.month > 1 else 12
        mes_arg = request.args.get('mes')
        mes = int(mes_arg) if mes_arg and mes_arg.isdigit() else ultimo_fechado
        ano = int(request.args.get('ano', now.year))
        marca_arg = request.args.get('marca')
        force = request.args.get('refresh') in ('1', 'true', 'True') or request.args.get('force') in ('1', 'true', 'True')
        
        if force:
            cached_categorias_data.clear()
            
        data = obter_dados_categorias_marcas(mes, ano, marca_filter=marca_arg, force_refresh=force)
        return jsonify({"success": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})

cached_paises_data = {}
cached_paises_raw_df = {}

def _mapear_cat_row_paises(row):
    marca = str(row.get('MARCA', '')).upper()
    gp_pai = str(row.get('GRUPO_PAI', '')).upper()
    gp_sint = str(row.get('GRUPO_SINTETICO', '')).upper()
    gp_anal = str(row.get('GRUPO_ANALITICO', '')).upper()
    descr = str(row.get('PRODUTO', '')).upper()

    if 'SPARE' in gp_pai or 'SPARE' in gp_sint or marca.startswith('SP ') or 'SPARE PARTS' in gp_anal or ' - SP' in descr or 'SPARE' in descr:
        return 'Spare Parts'
    if 'PARLUX' in marca or 'PARLUX' in descr or 'PARLUX' in gp_anal:
        return 'Parlux'
    if 'ESCOVA ELETRICA' in gp_sint or 'SECADORA' in descr or 'TRISCOVA' in descr or 'LIZIN' in descr or 'ESCOVA ALISADORA' in descr:
        return 'Escova Secadora'
    if 'ESCOVA' in gp_pai or 'ESCOVA' in gp_sint or 'ESCOVA' in gp_anal or 'ESCOVA' in descr:
        return 'Escova Uso Diário'
    if 'PRANCHA' in gp_sint or 'PRANCHA' in gp_anal or 'PRANCHA' in descr:
        return 'Prancha'
    if 'SECADOR' in gp_sint or 'SECADOR' in gp_anal or 'SECADOR' in descr:
        return 'Secador'
    if 'MODELADOR' in gp_sint or 'MODELADOR' in gp_anal or 'MODELADOR' in descr:
        return 'Modelador'
    if 'MAQUINA' in gp_sint or 'MAQUINA' in gp_anal or 'MAQUINA' in descr or 'BARBER' in gp_sint or 'BARBER' in gp_anal:
        return 'Maquina'
    if 'TESOURA' in gp_sint or 'TESOURA' in gp_anal or 'TESOURA' in descr or 'TESOURA' in marca or descr.startswith('TES '):
        return 'Tesoura'
    return 'Outros'

def obter_dados_paises(mes, ano, marca_filter=None, pais_filter=None, force_refresh=False):
    cache_key = f"{ano}_{mes}_{marca_filter}_{pais_filter}"
    now_ts = time.time()
    if not force_refresh and cache_key in cached_paises_data:
        data, ts = cached_paises_data[cache_key]
        if now_ts - ts < CACHE_TTL_HEAVY:
            return data

    now = datetime.now()
    if not mes or mes < 1 or mes > 12:
        mes_ref = now.month - 1 if now.month > 1 else 12
    else:
        mes_ref = mes
    ano_ref = ano
    ano_ant = ano_ref - 1

    df = None
    if not force_refresh and ano_ref in cached_paises_raw_df:
        df_cached, ts_raw = cached_paises_raw_df[ano_ref]
        if now_ts - ts_raw < CACHE_TTL_HEAVY:
            df = df_cached.copy()

    disk_file = os.path.join(DISK_CACHE_DIR, f'paises_raw_{ano_ref}.pkl')
    if df is None and not force_refresh and os.path.exists(disk_file):
        file_age = now_ts - os.path.getmtime(disk_file)
        if file_age < CACHE_TTL_HEAVY:
            try:
                df = pd.read_pickle(disk_file)
                cached_paises_raw_df[ano_ref] = (df.copy(), now_ts)
            except Exception as e:
                print(f"[CACHE DISCO] Erro ao carregar arquivo de cache {disk_file}: {e}")

    if df is None:
        query = f"""
        SELECT 
            NVL(V.NOME_PAIS, 'NÃO INFORMADO') AS NOME_PAIS,
            V.CODPROD,
            NVL(TRIM(P.DESCRPROD), NVL(TRIM(V.DESCRPROD), 'OUTROS')) AS PRODUTO,
            NVL(TRIM(P.MARCA), NVL(TRIM(V.MARCA), 'OUTRAS')) AS MARCA,
            NVL(TRIM(P.GRUPO_PAI), 'OUTROS') AS GRUPO_PAI,
            NVL(TRIM(P.GRUPO_SINTETICO), 'OUTROS') AS GRUPO_SINTETICO,
            NVL(TRIM(P.GRUPO_ANALITICO), 'OUTROS') AS GRUPO_ANALITICO,
            TRUNC(V.DTENTSAI) AS DATA,
            V.ANO,
            V.MES,
            SUM(V.CALCULO_LIQUIDO_COM_IPI) AS CALCULO_LIQUIDO_COM_IPI
        FROM (
            SELECT 
                ITE.CODPROD,
                PAI.DESCRICAO AS NOME_PAIS,
                PRO.DESCRPROD,
                PRO.MARCA,
                CAB.DTENTSAI,
                TO_NUMBER(TO_CHAR(CAB.DTENTSAI, 'YYYY')) AS ANO,
                TO_NUMBER(TO_CHAR(CAB.DTENTSAI, 'MM')) AS MES,
                ( ((ITE.VLRTOT - ITE.VLRDESC - ITE.VLRREPRED + ITE.VLRSUBST + ITE.VLRIPI) * VCA.INDITENSBRUTO) * CASE WHEN TOP.BONIFICACAO = 'S' THEN 0 ELSE 1 END * DECODE(CAB.TIPMOV,'D',0,'V',1)
                  - ((ITE.VLRTOT - ITE.VLRDESC - ITE.VLRREPRED + ITE.VLRSUBST + ITE.VLRIPI) * VCA.INDITENSBRUTO) * CASE WHEN TOP.BONIFICACAO = 'S' THEN 0 ELSE 1 END * DECODE(CAB.TIPMOV,'D',1,'V',0)
                  - (F_OBTEM_FRETEITE(CAB.NUNOTA,ITE.SEQUENCIA) * CASE WHEN TOP.BONIFICACAO = 'S' THEN 0 ELSE 1 END) * DECODE(CAB.TIPMOV,'D',-1,'V',1)
                ) AS CALCULO_LIQUIDO_COM_IPI
            FROM TGFCAB CAB,
                 TGFITE ITE,
                 TGFTOP TOP,
                 TGFPAR PAR,
                 TGFTPP TPP,
                 TGFGRU GRU,
                 TGFPRO PRO,
                 TSICID CID,
                 TSIUFS UFS,
                 TSIPAI PAI,
                 VGFCAB VCA
            WHERE CAB.CODTIPOPER = TOP.CODTIPOPER
              AND CAB.DHTIPOPER = TOP.DHALTER
              AND CAB.NUNOTA = ITE.NUNOTA
              AND CAB.CODPARC = PAR.CODPARC
              AND PRO.CODPROD = ITE.CODPROD
              AND PRO.CODGRUPOPROD = GRU.CODGRUPOPROD
              AND PAR.CODTIPPARC = TPP.CODTIPPARC
              AND PAR.CODCID = CID.CODCID
              AND CID.UF = UFS.CODUF
              AND UFS.CODPAIS = PAI.CODPAIS
              AND CAB.TIPMOV IN ('V', 'D')
              AND CAB.STATUSNOTA = 'L'
              AND CAB.NUNOTA = VCA.NUNOTA
              AND (TOP.GOLSINAL = -1 OR BONIFICACAO='S')
              AND (NOT EXISTS(SELECT 1 FROM TGFVAR VAR WHERE VAR.NUNOTA = ITE.NUNOTA AND VAR.NUNOTAORIG = VAR.NUNOTA AND VAR.SEQUENCIAORIG = ITE.SEQUENCIA))
              AND (TOP.ATUALFINTERC <> 'N' OR TOP.ATUALESTTERC = 'N' OR ITE.TERCEIROS <> 'S')
              AND ITE.SEQUENCIA > 0
              AND TOP.GOLDEV IN (1,-1)
              AND PAI.CODPAIS NOT IN (0, 55)
              AND UPPER(TRIM(PAI.DESCRICAO)) NOT IN ('BRASIL', 'NÃO INFORMADO', 'NAO INFORMADO', 'EX')
              AND CAB.DTENTSAI >= TO_DATE('01/01/{ano_ant}','DD/MM/YYYY')
              AND CAB.DTENTSAI <= TO_DATE('31/12/{ano_ref}','DD/MM/YYYY')
        ) V
        LEFT JOIN VW_MQ_TGFPRO_POWER_BI P ON TO_CHAR(V.CODPROD) = TO_CHAR(P.CODPROD)
        WHERE UPPER(TRIM(NVL(V.NOME_PAIS, 'NÃO INFORMADO'))) NOT IN ('BRASIL', 'NÃO INFORMADO', 'NAO INFORMADO', 'EX')
        GROUP BY V.NOME_PAIS, V.CODPROD, NVL(TRIM(P.DESCRPROD), NVL(TRIM(V.DESCRPROD), 'OUTROS')), NVL(TRIM(P.MARCA), NVL(TRIM(V.MARCA), 'OUTRAS')), NVL(TRIM(P.GRUPO_PAI), 'OUTROS'), NVL(TRIM(P.GRUPO_SINTETICO), 'OUTROS'), NVL(TRIM(P.GRUPO_ANALITICO), 'OUTROS'), TRUNC(V.DTENTSAI), V.ANO, V.MES
        """

        conn = get_db_connection()
        try:
            df = pd.read_sql(query, conn)
        finally:
            conn.close()

        df['NOME_PAIS'] = df['NOME_PAIS'].astype(str).str.strip().str.upper()
        df = df[~df['NOME_PAIS'].isin(['BRASIL', 'NÃO INFORMADO', 'NAO INFORMADO', 'EX', 'NONE', 'NAN', ''])]
        df['DATA'] = pd.to_datetime(df['DATA'])
        df['PRODUTO'] = df['GRUPO_ANALITICO'].where(
            (df['GRUPO_ANALITICO'] != 'OUTROS') & (df['GRUPO_ANALITICO'] != '') & (df['GRUPO_ANALITICO'].notna()),
            df['PRODUTO'].astype(str).str.strip()
        )
        df['MARCA'] = df['MARCA'].astype(str).str.strip().str.upper()
        df['CATEGORIA'] = df.apply(_mapear_cat_row_paises, axis=1)

        cached_paises_raw_df[ano_ref] = (df.copy(), now_ts)
        try:
            df.to_pickle(disk_file)
        except Exception as e:
            print(f"[CACHE DISCO] Erro ao salvar arquivo de cache {disk_file}: {e}")

    # Garantir que colunas essenciais existem
    if 'CATEGORIA' not in df.columns:
        df['CATEGORIA'] = df.apply(_mapear_cat_row_paises, axis=1)
    if 'PRODUTO' not in df.columns:
        df['PRODUTO'] = 'OUTROS'

    # Lista de todas as marcas e países únicos disponíveis para os filtros
    marcas_unicas = sorted([m for m in df['MARCA'].dropna().unique() if m and m not in ('OUTRAS', 'NONE', 'NAN')])
    paises_unicos = sorted([p for p in df['NOME_PAIS'].dropna().unique() if p and p not in ('NONE', 'NAN')])

    # Aplicar filtros opcionais
    df_filtrado = df.copy()
    if marca_filter and str(marca_filter).strip().upper() not in ('TODAS', '', 'NONE', 'NULL'):
        if ',' in str(marca_filter):
            m_list = [m.strip().upper() for m in str(marca_filter).split(',') if m.strip()]
            df_filtrado = df_filtrado[df_filtrado['MARCA'].isin(m_list)]
        else:
            df_filtrado = df_filtrado[df_filtrado['MARCA'] == str(marca_filter).strip().upper()]

    if pais_filter and str(pais_filter).strip().upper() not in ('TODOS', '', 'NONE', 'NULL'):
        if ',' in str(pais_filter):
            p_list = [p.strip().upper() for p in str(pais_filter).split(',') if p.strip()]
            df_filtrado = df_filtrado[df_filtrado['NOME_PAIS'].isin(p_list)]
        else:
            df_filtrado = df_filtrado[df_filtrado['NOME_PAIS'] == str(pais_filter).strip().upper()]

    corte = mt.data_corte_contexto(mes_ref, ano_ref)
    parcial = mt.mes_esta_parcial(corte)
    p_ytd = mt.periodo_ytd(corte)
    p_ytda = mt.periodo_ytd_ano_anterior(corte, parcial)

    mask_atual = (df_filtrado['DATA'].dt.date >= p_ytd[0]) & (df_filtrado['DATA'].dt.date <= p_ytd[1])
    mask_ant = (df_filtrado['DATA'].dt.date >= p_ytda[0]) & (df_filtrado['DATA'].dt.date <= p_ytda[1])

    # 1. Agrupamento por País
    v_ytd = df_filtrado[mask_atual].groupby('NOME_PAIS')['CALCULO_LIQUIDO_COM_IPI'].sum().to_dict()
    v_ytda = df_filtrado[mask_ant].groupby('NOME_PAIS')['CALCULO_LIQUIDO_COM_IPI'].sum().to_dict()

    tot_ytd = sum(v_ytd.values())
    tot_ytda = sum(v_ytda.values())

    # 2. Agrupamento por Categoria dentro de cada País
    v_cat_ytd = df_filtrado[mask_atual].groupby(['NOME_PAIS', 'CATEGORIA'])['CALCULO_LIQUIDO_COM_IPI'].sum().to_dict()
    v_cat_ytda = df_filtrado[mask_ant].groupby(['NOME_PAIS', 'CATEGORIA'])['CALCULO_LIQUIDO_COM_IPI'].sum().to_dict()

    # 3. Agrupamento por Produto dentro de cada País e Categoria
    v_prod_ytd = df_filtrado[mask_atual].groupby(['NOME_PAIS', 'CATEGORIA', 'PRODUTO'])['CALCULO_LIQUIDO_COM_IPI'].sum().to_dict()
    v_prod_ytda = df_filtrado[mask_ant].groupby(['NOME_PAIS', 'CATEGORIA', 'PRODUTO'])['CALCULO_LIQUIDO_COM_IPI'].sum().to_dict()

    paises_todos = set(v_ytd.keys()) | set(v_ytda.keys())
    ordenados = sorted(paises_todos, key=lambda p: v_ytd.get(p, 0.0), reverse=True)
    ord_ant = sorted(paises_todos, key=lambda p: v_ytda.get(p, 0.0), reverse=True)
    rank_ant_map = {p: i + 1 for i, p in enumerate(ord_ant) if v_ytda.get(p, 0.0) > 0}

    linhas = []
    for idx, p in enumerate(ordenados):
        fat = float(v_ytd.get(p, 0.0))
        fat_ant = float(v_ytda.get(p, 0.0))

        if fat == 0.0 and fat_ant == 0.0:
            continue

        rank = idx + 1
        r_ant = rank_ant_map.get(p)
        delta_rank = (r_ant - rank) if (r_ant is not None and rank is not None) else None

        share = round(fat / tot_ytd * 100, 1) if tot_ytd > 0 else 0.0
        share_ant = round(fat_ant / tot_ytda * 100, 1) if tot_ytda > 0 else 0.0
        var_pp = round(share - share_ant, 1)
        evolucao_pct = round(((fat - fat_ant) / fat_ant * 100), 1) if fat_ant > 0 else (100.0 if fat > 0 else 0.0)

        # Categorias do País
        cats_pais = set()
        for k in v_cat_ytd.keys():
            if k[0] == p:
                cats_pais.add(k[1])
        for k in v_cat_ytda.keys():
            if k[0] == p:
                cats_pais.add(k[1])

        cats_lista = []
        for cat_nome in sorted(cats_pais, key=lambda c: v_cat_ytd.get((p, c), 0.0), reverse=True):
            fat_c = float(v_cat_ytd.get((p, cat_nome), 0.0))
            fat_c_ant = float(v_cat_ytda.get((p, cat_nome), 0.0))
            if fat_c == 0.0 and fat_c_ant == 0.0:
                continue

            share_c = round(fat_c / fat * 100, 1) if fat > 0 else 0.0
            share_c_ant = round(fat_c_ant / fat_ant * 100, 1) if fat_ant > 0 else 0.0
            var_pp_c = round(share_c - share_c_ant, 1)
            evol_c = round(((fat_c - fat_c_ant) / fat_c_ant * 100), 1) if fat_c_ant > 0 else (100.0 if fat_c > 0 else 0.0)

            # Produtos da Categoria
            prods_cat = set()
            for k in v_prod_ytd.keys():
                if k[0] == p and k[1] == cat_nome:
                    prods_cat.add(k[2])
            for k in v_prod_ytda.keys():
                if k[0] == p and k[1] == cat_nome:
                    prods_cat.add(k[2])

            prods_lista = []
            for prod_nome in sorted(prods_cat, key=lambda pr: v_prod_ytd.get((p, cat_nome, pr), 0.0), reverse=True):
                fat_pr = float(v_prod_ytd.get((p, cat_nome, prod_nome), 0.0))
                fat_pr_ant = float(v_prod_ytda.get((p, cat_nome, prod_nome), 0.0))
                if fat_pr == 0.0 and fat_pr_ant == 0.0:
                    continue

                share_pr = round(fat_pr / fat_c * 100, 1) if fat_c > 0 else 0.0
                share_pr_pais = round(fat_pr / fat * 100, 1) if fat > 0 else 0.0
                share_pr_ant = round(fat_pr_ant / fat_c_ant * 100, 1) if fat_c_ant > 0 else 0.0
                var_pp_pr = round(share_pr - share_pr_ant, 1)
                evol_pr = round(((fat_pr - fat_pr_ant) / fat_pr_ant * 100), 1) if fat_pr_ant > 0 else (100.0 if fat_pr > 0 else 0.0)

                prods_lista.append({
                    "item": prod_nome,
                    "faturamento": round(fat_pr, 2),
                    "faturamento_ant": round(fat_pr_ant, 2),
                    "share": share_pr,
                    "share_pais": share_pr_pais,
                    "share_ant": share_pr_ant,
                    "var_pp": var_pp_pr,
                    "evolucao_pct": evol_pr
                })

            cats_lista.append({
                "item": cat_nome,
                "faturamento": round(fat_c, 2),
                "faturamento_ant": round(fat_c_ant, 2),
                "share": share_c,
                "share_ant": share_c_ant,
                "var_pp": var_pp_c,
                "evolucao_pct": evol_c,
                "produtos": prods_lista
            })

        linhas.append({
            "item": p,
            "rank": rank,
            "rank_ant": r_ant,
            "delta_rank": delta_rank,
            "faturamento": round(fat, 2),
            "faturamento_ant": round(fat_ant, 2),
            "share": share,
            "share_ant": share_ant,
            "var_pp": var_pp,
            "evolucao_pct": evolucao_pct,
            "categorias": cats_lista,
            "produtos": cats_lista
        })

    nomes_meses_br = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    contexto = {
        "corte": corte.isoformat(),
        "parcial": parcial,
        "dias": corte.day,
        "periodos": {
            "ytd": [p_ytd[0].isoformat(), p_ytd[1].isoformat()],
            "ytd_anterior": [p_ytda[0].isoformat(), p_ytda[1].isoformat()],
        },
    }

    resultado = {
        "mes": mes_ref,
        "ano": ano_ref,
        "mes_solicitado": mes,
        "mes_nome": nomes_meses_br[mes_ref],
        "total_faturamento": round(tot_ytd, 2),
        "total_faturamento_ant": round(tot_ytda, 2),
        "marcas": marcas_unicas,
        "paises_lista": paises_unicos,
        "contexto": contexto,
        "paises": linhas
    }

    cached_paises_data[cache_key] = (resultado, now_ts)
    return resultado

@app.route('/api/paises_vendas')
def api_paises_vendas():
    try:
        mes = request.args.get('mes', datetime.now().month)
        ano = request.args.get('ano', datetime.now().year)
        
        try:
            mes = int(mes)
            ano = int(ano)
        except ValueError:
            return jsonify({'success': False, 'error': 'Parâmetros mês e ano inválidos'})

        df = obter_dados_paises(mes, ano)
        if df.empty:
            return jsonify({'success': True, 'data': []})

        # Processar dados para a view
        resultados = []
        for index, row in df.iterrows():
            resultados.append({
                'pais': row['DESCRICAO'] if pd.notna(row['DESCRICAO']) else 'Desconhecido',
                'vendas': float(row['VENDAS']) if pd.notna(row['VENDAS']) else 0.0,
                'pedidos': float(row['PEDIDOS']) if pd.notna(row['PEDIDOS']) else 0.0,
                'devolucoes': float(row['DEVOLUCAO']) if pd.notna(row['DEVOLUCAO']) else 0.0,
                'total_geral': float(row['TOTAL_GERAL']) if pd.notna(row['TOTAL_GERAL']) else 0.0,
                'margem_lucro': float(row['MARGEM_LUCRO']) if pd.notna(row['MARGEM_LUCRO']) else 0.0
            })
            
        # Ordenar por vendas decrescente
        resultados = sorted(resultados, key=lambda x: x['vendas'], reverse=True)

        return jsonify({
            'success': True,
            'data': resultados
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})

cached_estoque_previsao = {
    'data': None,
    'timestamp': 0
}

def obter_dados_estoque_previsao(force=False):
    global cached_estoque_previsao
    disk_file = os.path.join(DISK_CACHE_DIR, 'estoque_previsao.pkl')
    now_ts = time.time()

    if not force and cached_estoque_previsao['data'] is not None and (now_ts - cached_estoque_previsao['timestamp'] < CACHE_TTL):
        return cached_estoque_previsao['data']

    if not force and os.path.exists(disk_file):
        file_age = now_ts - os.path.getmtime(disk_file)
        if file_age < CACHE_TTL:
            try:
                import pickle
                with open(disk_file, 'rb') as f:
                    payload = pickle.load(f)
                    cached_estoque_previsao['data'] = payload['data']
                    cached_estoque_previsao['timestamp'] = now_ts
                    cached_estoque_previsao['meta'] = payload.get('meta', {})
                    return payload['data']
            except Exception as e:
                print(f"[CACHE DISCO] Erro ao ler {disk_file}: {e}")

    conn = get_db_connection()
    # Meses dinamicos para labels
    now = datetime.now()
    nomes_meses_br = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    mes_atual_num  = now.month
    ano_atual      = now.year
    mes_m1_num  = 12 if mes_atual_num == 1 else mes_atual_num - 1
    mes_m2_num  = 11 if mes_atual_num <= 2 else mes_atual_num - 2
    mes_m3_num  = 10 if mes_atual_num <= 3 else mes_atual_num - 3
    label_ma  = f"{nomes_meses_br[mes_atual_num]}/{str(ano_atual)[2:]}"
    label_m1  = f"{nomes_meses_br[mes_m1_num]}/{str(ano_atual)[2:]}"
    label_m2  = f"{nomes_meses_br[mes_m2_num]}/{str(ano_atual)[2:]}"
    label_m3  = f"{nomes_meses_br[mes_m3_num]}/{str(ano_atual)[2:]}"

    query = """
    WITH VENDA_MEDIA AS (
        SELECT 
            ITE.CODPROD,
            SUM(CASE WHEN CAB.DTENTSAI >= TRUNC(SYSDATE, 'MM') THEN CASE WHEN TOP.GOLDEV = -1 THEN -ITE.QTDNEG ELSE ITE.QTDNEG END ELSE 0 END) AS QTD_VENDAS_MES,
            SUM(CASE WHEN CAB.DTENTSAI >= SYSDATE - 90 THEN CASE WHEN TOP.GOLDEV = -1 THEN -ITE.QTDNEG ELSE ITE.QTDNEG END ELSE 0 END) / 90 AS VENDA_MEDIA_DIARIA,
            SUM(CASE WHEN CAB.DTENTSAI >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -1) AND CAB.DTENTSAI < TRUNC(SYSDATE, 'MM') THEN CASE WHEN TOP.GOLDEV = -1 THEN -ITE.QTDNEG ELSE ITE.QTDNEG END ELSE 0 END) AS QTD_M1,
            SUM(CASE WHEN CAB.DTENTSAI >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -2) AND CAB.DTENTSAI < ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -1) THEN CASE WHEN TOP.GOLDEV = -1 THEN -ITE.QTDNEG ELSE ITE.QTDNEG END ELSE 0 END) AS QTD_M2,
            SUM(CASE WHEN CAB.DTENTSAI >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -3) AND CAB.DTENTSAI < ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -2) THEN CASE WHEN TOP.GOLDEV = -1 THEN -ITE.QTDNEG ELSE ITE.QTDNEG END ELSE 0 END) AS QTD_M3
        FROM TGFCAB CAB
        JOIN TGFITE ITE ON CAB.NUNOTA = ITE.NUNOTA
        JOIN TGFTOP TOP ON CAB.CODTIPOPER = TOP.CODTIPOPER AND TOP.DHALTER = CAB.DHTIPOPER
        WHERE CAB.DTENTSAI >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -3)
          AND TOP.GOLDEV IN (0, 1, -1)
          AND CAB.STATUSNOTA = 'L'
          AND (TOP.ATUALFINTERC <> 'N' OR TOP.ATUALESTTERC = 'N' OR ITE.TERCEIROS <> 'S')
          AND ITE.SEQUENCIA > 0
          AND (NOT EXISTS(SELECT 1 FROM TGFVAR VAR WHERE VAR.NUNOTA = ITE.NUNOTA AND VAR.NUNOTAORIG = VAR.NUNOTA AND VAR.SEQUENCIAORIG = ITE.SEQUENCIA))
          AND CAB.CODEMP NOT IN (SELECT CODEMP FROM TSIEMP WHERE NOMEFANTASIA IN ('EKOS - SP', 'GLOBRAL - SP', 'QUALITY - MATRIZ'))
          AND CAB.CODVEND NOT IN (SELECT CODVEND FROM TGFVEN WHERE APELIDO = 'MULTIMAQ REPRES')
        GROUP BY ITE.CODPROD
    ),
    EST_POR_EMP AS (
        SELECT 
            CODEMP,
            CODPROD,
            SUM(NVL(ESTOQUE, 0))    AS SALDO_ESTQ,
            SUM(NVL(RESERVADO, 0))  AS SALDO_RESV
        FROM TGFEST
        WHERE TIPO = 'P' AND CODPARC = 0
        GROUP BY CODEMP, CODPROD
    ),
    PROD_BASE AS (
        SELECT DISTINCT
            P.CODPROD,
            P.DESCRPROD,
            P.MARCA,
            P.DESCRGRUPOPROD AS CATEGORIA,
            P.GRUPO_SINTETICO,
            P.GRUPO_ANALITICO,
            P.GRUPO_PAI AS TIPO_GRUPO
        FROM VW_MQ_TGFPRO_POWER_BI P
        WHERE P.DESCRGRUPOPROD NOT IN ('EMBALAGENS', 'FABRICA', 'SERVICOS', 'SERVIÇOS', 'USO E CONSUMO', 'USO E COMSUMO', 'SPARE PARTS')
          AND P.DESCRGRUPOPROD NOT LIKE 'MAQUINAS P/ IND VIDRAC%'
          AND P.DESCRGRUPOPROD NOT LIKE 'MAQUINA P INDUSTRIA DE VIDRO%'
          AND P.MARCA <> 'TERMIX'
    )
    SELECT 
        PB.CODPROD,
        PB.DESCRPROD      AS NOME_PRODUTO,
        PB.MARCA,
        PB.CATEGORIA,
        PB.GRUPO_SINTETICO,
        PB.GRUPO_ANALITICO,
        PB.TIPO_GRUPO,
        NVL((SELECT SUM(E.SALDO_ESTQ) FROM EST_POR_EMP E JOIN VMQ_TSIEMP EMP ON E.CODEMP = EMP.CODEMP
             WHERE E.CODPROD = PB.CODPROD
               AND EMP.RAZAOABREV NOT IN ('EKOS - SP','GLOBRAL - SP','QUALITY MATRIZ','QUALITY - MATRIZ','MCM RSCP'))
             , 0) AS SALDO_EMPRESA,
        NVL((SELECT SUM(E.SALDO_RESV) FROM EST_POR_EMP E JOIN VMQ_TSIEMP EMP ON E.CODEMP = EMP.CODEMP
             WHERE E.CODPROD = PB.CODPROD
               AND EMP.RAZAOABREV NOT IN ('EKOS - SP','GLOBRAL - SP','QUALITY MATRIZ','QUALITY - MATRIZ','MCM RSCP'))
             , 0) AS SALDO_RESV_EMPRESA,
        NVL((SELECT SUM(E.SALDO_ESTQ) FROM EST_POR_EMP E JOIN VMQ_TSIEMP EMP ON E.CODEMP = EMP.CODEMP
             WHERE E.CODPROD = PB.CODPROD AND EMP.RAZAOABREV LIKE '%MCM%')
             , 0) AS SALDO_MCM,
        NVL(VM.QTD_VENDAS_MES,    0) AS QTD_VENDAS_MES,
        NVL(VM.VENDA_MEDIA_DIARIA, 0) AS VENDA_MEDIA_DIARIA,
        NVL(VM.QTD_M1,  0) AS QTD_M1,
        NVL(VM.QTD_M2,  0) AS QTD_M2,
        NVL(VM.QTD_M3,  0) AS QTD_M3
    FROM PROD_BASE PB
    LEFT JOIN VENDA_MEDIA VM ON PB.CODPROD = VM.CODPROD
    WHERE (
        NVL(VM.QTD_VENDAS_MES, 0) > 0
        OR NVL(VM.QTD_M1, 0) > 0
        OR NVL(VM.QTD_M2, 0) > 0
        OR NVL(VM.QTD_M3, 0) > 0
        OR NVL((SELECT SUM(E.SALDO_ESTQ) FROM EST_POR_EMP E WHERE E.CODPROD = PB.CODPROD), 0) > 0
    )
    ORDER BY PB.DESCRPROD ASC
    """
    try:
        df = pd.read_sql(query, conn)
    finally:
        conn.close()

    # Calcular campos derivados no Python
    def calc_dias(row):
        vmd = float(row['VENDA_MEDIA_DIARIA']) if row['VENDA_MEDIA_DIARIA'] else 0
        saldo = float(row['SALDO_EMPRESA']) if row['SALDO_EMPRESA'] else 0
        if vmd > 0:
            return int(round(saldo / vmd))
        return 9999

    df['SALDO_EMPRESA']     = pd.to_numeric(df['SALDO_EMPRESA'], errors='coerce').fillna(0)
    df['SALDO_MCM']         = pd.to_numeric(df['SALDO_MCM'], errors='coerce').fillna(0)
    df['SALDO_RESV_EMPRESA']= pd.to_numeric(df['SALDO_RESV_EMPRESA'], errors='coerce').fillna(0)
    df['QTD_VENDAS_MES']    = pd.to_numeric(df['QTD_VENDAS_MES'], errors='coerce').fillna(0)
    df['VENDA_MEDIA_DIARIA']= pd.to_numeric(df['VENDA_MEDIA_DIARIA'], errors='coerce').fillna(0)
    df['QTD_M1']            = pd.to_numeric(df['QTD_M1'], errors='coerce').fillna(0)
    df['QTD_M2']            = pd.to_numeric(df['QTD_M2'], errors='coerce').fillna(0)
    df['QTD_M3']            = pd.to_numeric(df['QTD_M3'], errors='coerce').fillna(0)

    df['DIAS_COBERTURA']    = df.apply(calc_dias, axis=1)
    # SIRO = saldo reservado da empresa (itens em pedido)
    df['SIRO_ESTOQUE']      = df['SALDO_RESV_EMPRESA'].round(0).astype(int)
    # TT A TRANSFERIR = necessidade de reposição da empresa vinda do MCM
    # Se dias de cobertura < 30 e MCM tem estoque: sugerir transferência
    def calc_tt(row):
        dias = row['DIAS_COBERTURA']
        vmd  = float(row['VENDA_MEDIA_DIARIA'])
        estq = float(row['SALDO_EMPRESA'])
        mcm  = float(row['SALDO_MCM'])
        if dias == 9999 or vmd == 0 or mcm <= 0:
            return 0
        # Quantidade para atingir 60 dias de estoque
        ideal = round(vmd * 60)
        necessidade = max(0, ideal - estq)
        return min(int(necessidade), int(mcm))

    df['TT_TRANSFERIR'] = df.apply(calc_tt, axis=1)
    df = df.fillna('')

    # Adicionar labels dos meses para o frontend
    meta = {
        'label_ma': label_ma,
        'label_m1': label_m1,
        'label_m2': label_m2,
        'label_m3': label_m3
    }

    data = df.to_dict('records')
    # Converter numpy types para Python nativos
    for row in data:
        for k, v in row.items():
            if hasattr(v, 'item'):
                row[k] = v.item()

    cached_estoque_previsao['data'] = data
    cached_estoque_previsao['timestamp'] = time.time()
    cached_estoque_previsao['meta'] = meta
    try:
        import pickle
        with open(disk_file, 'wb') as f:
            pickle.dump({'data': data, 'meta': meta}, f)
    except Exception as e:
        print(f"[CACHE DISCO] Erro ao salvar {disk_file}: {e}")
    return data

@app.route('/api/estoque_previsao')
def api_estoque_previsao():
    try:
        force = request.args.get('refresh') in ('1', 'true', 'True') or request.args.get('force') in ('1', 'true', 'True')
        data = obter_dados_estoque_previsao(force=force)
        meta = cached_estoque_previsao.get('meta', {})
        return jsonify({'success': True, 'data': data, 'meta': meta})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})

# ==============================================================================
# GUIA TESTE ESTOQUE E PREVISÃO — COCKPIT DIRETORIA & LOGÍSTICA
# ==============================================================================
cached_teste_estoque = {
    'data': None,
    'top10': [],
    'categorias': [],
    'kpis': {},
    'timestamp': 0,
    'meta': {}
}

def map_categoria_simplificada(cat, marca=''):
    c = str(cat or '').upper().strip()
    m = str(marca or '').upper().strip()

    # Peças de reposição / Spare Parts (marcas SP MQ PRO, SP PARLUX, SP FORCE B, etc.)
    if m.startswith('SP ') or m.startswith('SPARE') or c.startswith('SPARE') or 'PECA' in c or 'PEÇA' in c:
        return 'Spare Parts'

    # Linha Parlux (se marca Parlux):
    if 'PARLUX' in m:
        return 'Parlux'

    # Regra estrita por GRUPO_SINTETICO da query conforme exigência do usuário:
    if c == 'PRANCHA':
        return 'Pranchas'
    if c == 'SECADOR':
        return 'Secadores'
    if c == 'MODELADOR':
        return 'Modeladores'
    if 'ESCOVA' in c:
        if 'ELETRICA' in c or 'ELÉTRICA' in c:
            return 'Escovas Elétricas'
        return 'Escovas'
    if c == 'TESOURA':
        return 'Tesouras'
    if 'MAQUINA' in c:
        return 'Máquinas'
    return c.title()

def obter_dados_teste_estoque(force=False):
    global cached_teste_estoque
    disk_file = os.path.join(DISK_CACHE_DIR, 'teste_estoque.pkl')
    now_ts = time.time()

    if not force and cached_teste_estoque['data'] is not None and (now_ts - cached_teste_estoque['timestamp'] < CACHE_TTL):
        return cached_teste_estoque

    if not force and os.path.exists(disk_file):
        file_age = now_ts - os.path.getmtime(disk_file)
        if file_age < CACHE_TTL:
            try:
                import pickle
                with open(disk_file, 'rb') as f:
                    payload = pickle.load(f)
                    cached_teste_estoque['data'] = payload['data']
                    cached_teste_estoque['produtos_em_risco'] = payload.get('produtos_em_risco', [])
                    cached_teste_estoque['top10'] = payload.get('top10', [])
                    cached_teste_estoque['categorias'] = payload.get('categorias', [])
                    cached_teste_estoque['kpis'] = payload.get('kpis', {})
                    cached_teste_estoque['timestamp'] = now_ts
                    cached_teste_estoque['meta'] = payload.get('meta', {})
                    return cached_teste_estoque
            except Exception as e:
                print(f"[CACHE DISCO] Erro ao ler {disk_file}: {e}")

    import numpy as np
    from dateutil.relativedelta import relativedelta
    hoje = date.today()
    nomes_meses_br = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    
    # Define os 4 meses fechados + mes atual (conforme Power BI: Mai, Jun, Jul, Ago + Set)
    meses_fechados = []
    meses_fechados_nomes = []
    for i in range(4, 0, -1):
        d = hoje - relativedelta(months=i)
        meses_fechados.append(f"{d.year}-{d.month:02d}")
        meses_fechados_nomes.append(f"{nomes_meses_br[d.month]}/{str(d.year)[2:]}")
        
    mes_atual_periodo = f"{hoje.year}-{hoje.month:02d}"
    label_mes_atual = f"VENDA(+) BONIF {nomes_meses_br[hoje.month].upper()} {str(hoje.year)[2:]}"

    data_inicio_obj = hoje - relativedelta(months=4)
    data_inicio_str = f"01/{data_inicio_obj.month:02d}/{data_inicio_obj.year}"

    conn = get_db_connection()
    try:
        # 1. Consulta1 oficial idêntica ao Power BI agrupada por DTENTSAI
        sql_sales = f"""
        SELECT 
            CAB.CODEMP,
            (SELECT E.NOMEFANTASIA FROM TSIEMP E WHERE E.CODEMP = CAB.CODEMP) as empresa,
            (SELECT tpp.descrtipparc FROM tgftpp tpp WHERE tpp.codtipparc=PAR.codtipparc) AS perfil_cli,
            (SELECT apelido FROM tgfven WHERE codvend=cab.codvend) AS vendedor,
            TO_CHAR(CAB.DTENTSAI, 'YYYY-MM') as MES_ENTSAI,
            TO_CHAR(ITE.CODPROD) as CODPROD,
            PRO.DESCRPROD AS PRODUTO,
            PRO.MARCA,
            (SELECT G.DESCRGRUPOPROD FROM TGFGRU G WHERE G.CODGRUPOPROD = CASE WHEN LENGTH(TO_CHAR(PRO.codgrupoprod))=7 THEN RPAD(SUBSTR(TO_CHAR(PRO.codgrupoprod),1,1),7,'0') ELSE RPAD(SUBSTR(TO_CHAR(PRO.codgrupoprod),1,2),8,'0') END) AS GRUPO_GERAL,
            (SELECT G.DESCRGRUPOPROD FROM TGFGRU G WHERE G.CODGRUPOPROD = CASE WHEN LENGTH(TO_CHAR(PRO.codgrupoprod))=7 THEN RPAD(SUBSTR(TO_CHAR(PRO.codgrupoprod),1,4),7,'0') ELSE RPAD(SUBSTR(TO_CHAR(PRO.codgrupoprod),1,5),8,'0') END) AS GRUPO_SINTETICO,
            GRU.DESCRGRUPOPROD AS GRUPO_ANALITICO,
            NVL(CASE WHEN CAB.CODEMP <> 501 AND NVL (TOP.BONIFICACAO, 'N') = 'N' THEN (ITE.QTDNEG) END * DECODE(CAB.TIPMOV,'D',0,'V',1), 0) AS QTDVENDIDA,
            NVL(CASE WHEN NVL (TOP.BONIFICACAO, 'N') = 'S' THEN (ITE.QTDNEG) END, 0) AS QTDBONIFIC
        FROM TGFCAB CAB,
             TGFITE ITE,
             TGFTOP TOP,
             TGFPAR PAR,
             TGFTPP TPP,
             TGFGRU GRU,
             TGFPRO PRO,
             TSICID CID,
             VGFCAB VCA
        WHERE CAB.DTENTSAI >= TO_DATE('{data_inicio_str}','DD/MM/YYYY')
          AND CAB.CODTIPOPER = TOP.CODTIPOPER
          AND CAB.DHTIPOPER = TOP.DHALTER
          AND CAB.NUNOTA = ITE.NUNOTA
          AND CAB.CODPARC = PAR.CODPARC
          AND PRO.CODPROD = ITE.CODPROD
          AND PRO.CODGRUPOPROD = GRU.CODGRUPOPROD
          AND PAR.CODTIPPARC = TPP.CODTIPPARC
          AND PAR.CODCID = CID.CODCID
          AND CAB.TIPMOV IN ('V', 'D')
          AND CAB.STATUSNOTA = 'L' 
          AND CAB.NUNOTA = VCA.NUNOTA
          AND (TOP.GOLSINAL = -1 OR BONIFICACAO='S')
          AND (NOT EXISTS(SELECT 1 FROM TGFVAR VAR WHERE VAR.NUNOTA = ITE.NUNOTA AND VAR.NUNOTAORIG = VAR.NUNOTA AND VAR.SEQUENCIAORIG = ITE.SEQUENCIA))
          AND (TOP.ATUALFINTERC <> 'N' OR TOP.ATUALESTTERC = 'N' OR  ITE.TERCEIROS <> 'S')
          AND ITE.SEQUENCIA > 0    
          AND TOP.GOLDEV IN (1,-1)
        """
        df_sales = pd.read_sql(sql_sales, conn)

        # 2. Cadastro de Produtos Ativos
        sql_prods = """
        SELECT 
            TO_CHAR(PRO.CODPROD) AS CODPROD,
            PRO.DESCRPROD AS PRODUTO,
            PRO.MARCA,
            (SELECT G.DESCRGRUPOPROD FROM TGFGRU G WHERE G.CODGRUPOPROD = CASE WHEN LENGTH(TO_CHAR(PRO.codgrupoprod))=7 THEN RPAD(SUBSTR(TO_CHAR(PRO.codgrupoprod),1,1),7,'0') ELSE RPAD(SUBSTR(TO_CHAR(PRO.codgrupoprod),1,2),8,'0') END) AS GRUPO_GERAL,
            (SELECT G.DESCRGRUPOPROD FROM TGFGRU G WHERE G.CODGRUPOPROD = CASE WHEN LENGTH(TO_CHAR(PRO.codgrupoprod))=7 THEN RPAD(SUBSTR(TO_CHAR(PRO.codgrupoprod),1,4),7,'0') ELSE RPAD(SUBSTR(TO_CHAR(PRO.codgrupoprod),1,5),8,'0') END) AS GRUPO_SINTETICO,
            GRU.DESCRGRUPOPROD AS GRUPO_ANALITICO
        FROM TGFPRO PRO, TGFGRU GRU
        WHERE PRO.CODGRUPOPROD = GRU.CODGRUPOPROD
          AND PRO.ATIVO = 'S'
        """
        df_prods = pd.read_sql(sql_prods, conn)

        # 3. Estoque Oficial: VMQ_ESTLOC2
        q_est = "SELECT TO_CHAR(CODPROD) AS CODPROD, CODEMP, SALDO FROM VMQ_ESTLOC2"
        df_est = pd.read_sql(q_est, conn)

    finally:
        conn.close()

    # Aplicação dos filtros globais idênticos aos do Power BI
    df_sales['TOTAL_QTD'] = df_sales['QTDVENDIDA'] + df_sales['QTDBONIFIC']

    df_filt = df_sales[
        ~df_sales['EMPRESA'].isin(['EKOS - SP', 'GLOBRAL - SP', 'QUALITY - MATRIZ']) &
        ~df_sales['PERFIL_CLI'].isin(['ATEND. DIRETO', 'INDUSTRIA VIDRACEIRA']) &
        ~df_sales['VENDEDOR'].isin(['MULTIMAQ REPRES']) &
        ~df_sales['GRUPO_GERAL'].isin(['EMBALAGENS', 'FABRICA', 'MAQUINAS P/ IND VIDRACARIA', 'SERVICOS', 'USO E CONSUMO']) &
        (df_sales['MARCA'] != 'TERMIX')
    ].copy()

    # Pivot vendas
    df_pivot = df_filt.pivot_table(
        index='CODPROD', 
        columns='MES_ENTSAI', 
        values='TOTAL_QTD', 
        aggfunc='sum', 
        fill_value=0
    ).reset_index()

    for m in meses_fechados + [mes_atual_periodo]:
        if m not in df_pivot.columns:
            df_pivot[m] = 0

    # Metadados de produto unificados
    df_meta_sales = df_filt[['CODPROD', 'PRODUTO', 'MARCA', 'GRUPO_GERAL', 'GRUPO_SINTETICO', 'GRUPO_ANALITICO']].drop_duplicates('CODPROD')
    df_meta_all = pd.concat([df_meta_sales, df_prods], ignore_index=True).drop_duplicates('CODPROD')

    # Agrupamento Estoque:
    # ESTOQUE EMPRESA = Total Grupo (todas empresas VMQ_ESTLOC2)
    # ESTOQUE MCR = CD Santa Catarina (CODEMP = 2)
    # ESTOQUE EMPRESA MCR = Matriz SP (CODEMP = 1)
    df_est_total = df_est.groupby('CODPROD')['SALDO'].sum().reset_index().rename(columns={'SALDO': 'ESTOQUE_EMPRESA'})
    df_est_mcr = df_est[df_est['CODEMP'] == 2].groupby('CODPROD')['SALDO'].sum().reset_index().rename(columns={'SALDO': 'ESTOQUE_MCR'})
    df_est_matriz = df_est[df_est['CODEMP'] == 1].groupby('CODPROD')['SALDO'].sum().reset_index().rename(columns={'SALDO': 'ESTOQUE_EMPRESA_MCR'})

    # Universo consolidado de produtos (com vendas ou estoque)
    all_cods = pd.DataFrame({'CODPROD': list(set(df_pivot['CODPROD']).union(set(df_est_total['CODPROD'])))})
    df_res = pd.merge(all_cods, df_meta_all, on='CODPROD', how='left')
    df_res = pd.merge(df_res, df_pivot, on='CODPROD', how='left')
    df_res = pd.merge(df_res, df_est_total, on='CODPROD', how='left')
    df_res = pd.merge(df_res, df_est_mcr, on='CODPROD', how='left')
    df_res = pd.merge(df_res, df_est_matriz, on='CODPROD', how='left')

    for m in meses_fechados + [mes_atual_periodo]:
        df_res[m] = df_res[m].fillna(0)

    df_res['ESTOQUE_EMPRESA'] = df_res['ESTOQUE_EMPRESA'].fillna(0).astype(int)
    df_res['ESTOQUE_MCR'] = df_res['ESTOQUE_MCR'].fillna(0).astype(int)
    df_res['ESTOQUE_EMPRESA_MCR'] = df_res['ESTOQUE_EMPRESA_MCR'].fillna(0).astype(int)
    df_res['ESTOQUE_TOTAL'] = df_res['ESTOQUE_EMPRESA']

    df_res['NOME_PRODUTO'] = df_res['PRODUTO'].fillna('PRODUTO ' + df_res['CODPROD'].astype(str))

    # MEDIA CONSUMO = soma dos 4 meses fechados / 4 (DAX: [VENDA (+) BONIF SOMA] / 4)
    df_res['MEDIA_CONSUMO'] = ((df_res[meses_fechados].sum(axis=1)) / 4.0).round()
    df_res['VENDA_MES_ATUAL'] = df_res[mes_atual_periodo].round().astype(int)
    df_res['CONSUMO_DIARIO'] = (df_res['MEDIA_CONSUMO'] / 30.0).round(1)

    # DIAS DE ESTOQUE (CONF. CONS.) = (ESTOQUE_EMPRESA / MEDIA_CONSUMO) * 30 (DAX: [DIASESTOQUE])
    mask_cons = df_res['MEDIA_CONSUMO'] > 0
    df_res['DIAS_ESTOQUE_TOTAL'] = 0
    df_res.loc[mask_cons, 'DIAS_ESTOQUE_TOTAL'] = ((df_res.loc[mask_cons, 'ESTOQUE_EMPRESA'] / df_res.loc[mask_cons, 'MEDIA_CONSUMO']) * 30.0).round().astype(int)

    df_res['DIAS_ESTOQUE_EMPRESA'] = 0
    df_res.loc[mask_cons, 'DIAS_ESTOQUE_EMPRESA'] = ((df_res.loc[mask_cons, 'ESTOQUE_EMPRESA_MCR'] / df_res.loc[mask_cons, 'MEDIA_CONSUMO']) * 30.0).round().astype(int)

    # GIRO DO ESTOQUE = ESTOQUE_MCR / (MEDIA_CONSUMO / 2) (DAX: [GIRO DO ESTOQUE])
    df_res['GIRO_ESTOQUE'] = 0.0
    df_res.loc[mask_cons, 'GIRO_ESTOQUE'] = (df_res.loc[mask_cons, 'ESTOQUE_MCR'] / (df_res.loc[mask_cons, 'MEDIA_CONSUMO'] / 2.0)).round(1)

    # TT. A TRANSFERIR (CAIXA) = ROUNDUP((MEDIA_CONSUMO / 2) / 12, 0) (DAX: [QTDE A TRANSFERIR CALCULO 2])
    df_res['TT_TRANSFERIR_CX'] = 0
    df_res.loc[mask_cons, 'TT_TRANSFERIR_CX'] = np.ceil((df_res.loc[mask_cons, 'MEDIA_CONSUMO'] / 2.0) / 12.0).astype(int)
    df_res['SUGESTAO_TRANSF'] = df_res['TT_TRANSFERIR_CX'] * 12

    # Categorias simplificadas
    df_res['GRUPO_SINTETICO'] = df_res['GRUPO_SINTETICO'].fillna('OUTROS').astype(str)
    df_res['MARCA'] = df_res['MARCA'].fillna('MQ Professional').astype(str)
    df_res['GRUPO_GERAL'] = df_res['GRUPO_GERAL'].fillna('OUTROS').astype(str)
    df_res['GRUPO_ANALITICO'] = df_res['GRUPO_ANALITICO'].fillna('OUTROS').astype(str)
    df_res['CATEGORIA_SIMP'] = [map_categoria_simplificada(c, m) for c, m in zip(df_res['GRUPO_SINTETICO'], df_res['MARCA'])]
    df_res['CATEGORIA'] = df_res['CATEGORIA_SIMP']

    # Filtrar itens de uso interno / embalagens / materiais de apoio
    df_res = df_res[~df_res['NOME_PRODUTO'].str.startswith(('MANUAL ', 'CAIXA ', 'TAG ', 'CERTIFICADO ', 'SACOLA ', 'DISPLAY '))]
    df_res = df_res[~df_res['NOME_PRODUTO'].str.contains(' - TAG - ')]

    # REGRA DO USUÁRIO: Excluir produtos sem nenhuma atividade ou com ZERO em todas as colunas
    # Se consumo médio for 0, venda no mês for 0, estoque empresa for 0 e estoque SC for 0:
    # (ou seja, produto zerado em todas as colunas da tela) -> NÃO MOSTRAR O PRODUTO NA TABELA.
    cond_zero_todas_colunas = (
        (df_res['MEDIA_CONSUMO'] == 0) &
        (df_res['VENDA_MES_ATUAL'] == 0) &
        (df_res['ESTOQUE_EMPRESA'] == 0) &
        (df_res['ESTOQUE_MCR'] == 0)
    )

    ultimos_3_fechados = meses_fechados[-3:] if len(meses_fechados) >= 3 else meses_fechados
    soma_vendas_3m = df_res[ultimos_3_fechados].sum(axis=1)
    cond_inativo = (
        (soma_vendas_3m == 0) &
        (df_res['MEDIA_CONSUMO'] == 0) &
        (df_res['VENDA_MES_ATUAL'] == 0) &
        (df_res['DIAS_ESTOQUE_TOTAL'] == 0) &
        (df_res['ESTOQUE_EMPRESA'] == 0) &
        (df_res['ESTOQUE_MCR'] == 0) &
        (df_res['GIRO_ESTOQUE'] == 0)
    )
    df_res = df_res[~(cond_zero_todas_colunas | cond_inativo)].copy()

    # Também excluir marcas de peças de reposição (SP MQ PRO, SP PARLUX, SP FORCE B, SP MQ B, etc.)
    df_res = df_res[~df_res['MARCA'].str.startswith(('SP ', 'SPARE'))].copy()

    # Previsão de Mês e Ano de Ruptura (baseado em DIAS_ESTOQUE_TOTAL)
    from datetime import timedelta
    def calc_previsao_ruptura(row):
        dias = int(row['DIAS_ESTOQUE_TOTAL'])
        med = float(row['MEDIA_CONSUMO'])
        est_tot = int(row['ESTOQUE_EMPRESA'])

        if est_tot <= 0 or dias <= 0:
            return 'Imediata'
        if med <= 0:
            return 'Sem Consumo'
        if dias > 730:
            return '> 2 anos'
        dt_rup = hoje + timedelta(days=dias)
        return f"{nomes_meses_br[dt_rup.month]}/{str(dt_rup.year)}"

    df_res['PREVISAO_RUPTURA'] = df_res.apply(calc_previsao_ruptura, axis=1)

    # Cálculo de Riscos & Ações Logísticas (alinhadas ao FAROL e STATUS FINAL do PBI)
    def calc_risco_pbi(row):
        med = float(row['MEDIA_CONSUMO'])
        e_emp = int(row['ESTOQUE_EMPRESA_MCR'])
        e_mcr = int(row['ESTOQUE_MCR'])
        e_tot = int(row['ESTOQUE_EMPRESA'])
        d_tot = int(row['DIAS_ESTOQUE_TOTAL'])
        d_emp = int(row['DIAS_ESTOQUE_EMPRESA'])
        giro = float(row['GIRO_ESTOQUE'])

        if med <= 0:
            return 'SEM_GIRO', 'Sem Giro / Sem Consumo', 5
        if e_tot <= 0:
            return 'RUPTURA_TOTAL', 'Ruptura Geral (Esgotado)', 1
        if d_tot <= 10:
            return 'CRITICO_GERAL', f'Ruptura Crítica ({d_tot}d no Grupo)', 1
        # DAX PBI: IF([DIASESTOQUE] <= 21 && [GIRO DO ESTOQUE] > 1.5, "TRANSFERE", "NÃO TRANSFERE")
        if e_emp <= 5 and e_mcr > 0 and med > 0:
            return 'REPOR_URGENTE_MCR', f'Matriz Zerada ({e_emp} un)', 2
        if d_emp <= 15 and e_mcr > 0 and med > 0:
            return 'REPOR_MCR', f'Matriz Baixa ({d_emp}d) — Transferir de SC', 2
        if d_tot <= 21 and giro > 1.5 and e_mcr > 0 and med > 0:
            return 'TRANSFERE_PBI', f'Status PBI: TRANSFERE (≤21d e Giro > 1.5)', 2
        if d_tot <= 30:
            return 'ATENCAO_GERAL', f'Atenção Reposição ({d_tot} dias)', 3
        if d_tot <= 60:
            return 'SAUDAVEL', f'Estoque Saudável ({d_tot} dias)', 4
        return 'ESTOQUE_ALTO', f'Estoque Alto ({d_tot} dias)', 4

    riscos = df_res.apply(calc_risco_pbi, axis=1)
    df_res['STATUS_RUPTURA'] = [r[0] for r in riscos]
    df_res['STATUS_RUPTURA_LABEL'] = [r[1] for r in riscos]
    df_res['PRIORIDADE_RUPTURA'] = [r[2] for r in riscos]

    # Cálculo da Curva ABC por Categoria baseado no consumo médio
    df_res['CURVA'] = 'C'
    for cat_name, grp_idx in df_res.groupby('CATEGORIA_SIMP').groups.items():
        grp_sub = df_res.loc[grp_idx].sort_values(by='MEDIA_CONSUMO', ascending=False)
        tot_c = grp_sub['MEDIA_CONSUMO'].sum()
        if tot_c > 0:
            cum = grp_sub['MEDIA_CONSUMO'].cumsum() / tot_c
            curva_s = pd.Series('C', index=grp_sub.index)
            curva_s[cum <= 0.80] = 'A'
            curva_s[(cum > 0.80) & (cum <= 0.95)] = 'B'
            df_res.loc[grp_sub.index, 'CURVA'] = curva_s

    # Mapear ordem da Curva: A=1, B=2, C=3 e ordenar: Curva A, depois B, depois C e MEDIA_CONSUMO decrescente
    ordem_map = {'A': 1, 'B': 2, 'C': 3}
    df_res['ORDEM_CURVA'] = df_res['CURVA'].map(ordem_map).fillna(3)
    df_res = df_res.sort_values(by=['ORDEM_CURVA', 'MEDIA_CONSUMO'], ascending=[True, False]).reset_index(drop=True)
    df_res['RANK_GERAL'] = df_res.index + 1
    df_res['IS_TOP10'] = df_res['RANK_GERAL'] <= 10
    df_res['RANK_CATEGORIA'] = df_res.groupby('CATEGORIA_SIMP')['MEDIA_CONSUMO'].rank(ascending=False, method='min').astype(int)

    # Sanitizar NaN em todo o dataframe para evitar JSON inválido
    df_res = df_res.fillna(0)

    # Helper para sanitizar listas de dicionários
    import math
    def sanitize_records(records):
        clean_list = []
        for r in records:
            clean_r = {}
            for k, v in r.items():
                if hasattr(v, 'item'):
                    v = v.item()
                if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    clean_r[k] = 0.0
                elif v is None:
                    clean_r[k] = ""
                else:
                    clean_r[k] = v
            clean_list.append(clean_r)
        return clean_list

    # TOP 10
    df_top10 = df_res[df_res['IS_TOP10']].copy()
    top10_list = sanitize_records(df_top10.to_dict('records'))

    # Produtos em Risco (Prioridades 1, 2 e 3)
    df_risco = df_res[df_res['PRIORIDADE_RUPTURA'].isin([1, 2, 3])].sort_values(by=['PRIORIDADE_RUPTURA', 'MEDIA_CONSUMO'], ascending=[True, False]).copy()
    produtos_em_risco = sanitize_records(df_risco.to_dict('records'))

    # Sumário por categoria
    cat_summary = []
    for cat_name, grp in df_res.groupby('CATEGORIA_SIMP'):
        skus_criticos_geral = int((grp['PRIORIDADE_RUPTURA'] == 1).sum())
        skus_repor_matriz = int((grp['PRIORIDADE_RUPTURA'] == 2).sum())
        skus_atencao = int((grp['PRIORIDADE_RUPTURA'] == 3).sum())
        total_risco = skus_criticos_geral + skus_repor_matriz + skus_atencao

        nivel = 'CRITICO' if skus_criticos_geral > 0 else ('REPOR' if skus_repor_matriz > 0 else ('ATENCAO' if skus_atencao > 0 else 'SEGURO'))

        cat_summary.append({
            'categoria': cat_name,
            'total_skus': len(grp),
            'skus_em_risco': total_risco,
            'skus_ruptura_geral': skus_criticos_geral,
            'skus_repor_matriz': skus_repor_matriz,
            'skus_atencao': skus_atencao,
            'media_consumo_tot': round(float(grp['MEDIA_CONSUMO'].sum()), 1),
            'consumo_diario_tot': round(float(grp['CONSUMO_DIARIO'].sum()), 1),
            'estoque_emp_tot': int(grp['ESTOQUE_EMPRESA_MCR'].sum()),
            'estoque_mcr_tot': int(grp['ESTOQUE_MCR'].sum()),
            'estoque_geral_tot': int(grp['ESTOQUE_EMPRESA'].sum()),
            'nivel_risco': nivel
        })
    cat_summary.sort(key=lambda x: (x['skus_ruptura_geral'] * 1000 + x['skus_repor_matriz'] * 100 + x['media_consumo_tot']), reverse=True)

    kpis = {
        'total_produtos': len(df_res),
        'top10_count': len(top10_list),
        'total_produtos_risco': len(produtos_em_risco),
        'total_repor_urgente_mcr': int((df_res['PRIORIDADE_RUPTURA'] == 2).sum()),
        'total_ruptura_critica': int((df_res['PRIORIDADE_RUPTURA'] == 1).sum()),
        'total_atencao': int((df_res['PRIORIDADE_RUPTURA'] == 3).sum()),
        'estoque_empresa_mcr_total': int(df_res['ESTOQUE_EMPRESA_MCR'].sum()),
        'estoque_mcr_total': int(df_res['ESTOQUE_MCR'].sum()),
        'estoque_grupo_total': int(df_res['ESTOQUE_EMPRESA'].sum()),
        'transf_sugerida_total': int(df_res['SUGESTAO_TRANSF'].sum()),
        'transf_sugerida_cx_total': int(df_res['TT_TRANSFERIR_CX'].sum()),
        'consumo_diario_global': round(float(df_res['CONSUMO_DIARIO'].sum()), 1),
        'media_consumo_global': round(float(df_res['MEDIA_CONSUMO'].sum()), 1)
    }

    meta = {
        'meses_fechados': meses_fechados_nomes,
        'label_mes_atual': label_mes_atual,
        'mes_atual_periodo': mes_atual_periodo,
        'gerado_em': datetime.now().strftime('%d/%m/%Y %H:%M:%S')
    }

    data = sanitize_records(df_res.to_dict('records'))

    cached_teste_estoque['data'] = data
    cached_teste_estoque['produtos_em_risco'] = produtos_em_risco
    cached_teste_estoque['top10'] = top10_list
    cached_teste_estoque['categorias'] = cat_summary
    cached_teste_estoque['kpis'] = kpis
    cached_teste_estoque['timestamp'] = time.time()
    cached_teste_estoque['meta'] = meta

    try:
        import pickle
        with open(disk_file, 'wb') as f:
            pickle.dump(cached_teste_estoque, f)
    except Exception as e:
        print(f"[CACHE DISCO] Erro ao salvar {disk_file}: {e}")

    return cached_teste_estoque

@app.route('/api/teste_estoque')
def api_teste_estoque():
    try:
        force = request.args.get('refresh') in ('1', 'true', 'True') or request.args.get('force') in ('1', 'true', 'True')
        res = obter_dados_teste_estoque(force=force)
        return jsonify({
            'success': True,
            'data': res['data'],
            'produtos_em_risco': res.get('produtos_em_risco', []),
            'top10': res['top10'],
            'categorias': res['categorias'],
            'kpis': res['kpis'],
            'meta': res['meta']
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/paises_dados')
def api_paises_dados():
    try:
        now = datetime.now()
        ultimo_fechado = now.month - 1 if now.month > 1 else 12
        mes_arg = request.args.get('mes')
        mes = int(mes_arg) if mes_arg and mes_arg.isdigit() else ultimo_fechado
        ano = int(request.args.get('ano', now.year))
        marca_arg = request.args.get('marca')
        pais_arg = request.args.get('pais')
        force = request.args.get('refresh') in ('1', 'true', 'True') or request.args.get('force') in ('1', 'true', 'True')
        
        if force:
            cached_paises_data.clear()
            cached_paises_raw_df.clear()
            
        data = obter_dados_paises(mes, ano, marca_filter=marca_arg, pais_filter=pais_arg, force_refresh=force)
        return jsonify({"success": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})

# Cache para consultas diárias
cached_diario_data = {}

def carregar_dados_diarios_sankhya(mes, ano, force_refresh=False):
    cache_key = f"{ano}_{mes}"
    now_ts = time.time()
    now = datetime.now()
    is_fechado = (ano < now.year) or (ano == now.year and mes < now.month)
    ttl = CACHE_TTL_HISTORIC if is_fechado else CACHE_TTL_REALTIME
    disk_file = os.path.join(DISK_CACHE_DIR, f'diario_{ano}_{mes}.pkl')

    if not force_refresh and cache_key in cached_diario_data:
        data, ts = cached_diario_data[cache_key]
        if now_ts - ts < ttl:
            return data.copy()

    if not force_refresh and os.path.exists(disk_file):
        file_age = now_ts - os.path.getmtime(disk_file)
        if file_age < ttl:
            try:
                df = pd.read_pickle(disk_file)
                cached_diario_data[cache_key] = (df.copy(), now_ts)
                return df.copy()
            except Exception as e:
                print(f"[CACHE DISCO] Erro ao ler {disk_file}: {e}")

    _, num_days = calendar.monthrange(ano, mes)
    dt_ini = f"01/{mes:02d}/{ano}"
    dt_fim = f"{num_days}/{mes:02d}/{ano}"

    sql = f"""
    SELECT 
        TO_NUMBER(TO_CHAR(CAB.DTENTSAI, 'DD')) AS DIA,
        CAB.CODVEND,
        UPPER(PRO.MARCA) AS MARCA,
        SUM(((ITE.VLRTOT - ITE.VLRDESC - ITE.VLRREPRED + ITE.VLRSUBST + ITE.VLRIPI) * VCA.INDITENSBRUTO) * 
            CASE WHEN TOP.BONIFICACAO = 'S' THEN 0 ELSE 1 END * DECODE(CAB.TIPMOV,'D',0,'V',1)) AS VALORVENDA
    FROM TGFCAB CAB,
         TGFITE ITE,
         TGFTOP TOP,
         TGFPAR PAR,
         TGFTPP TPP,
         TGFGRU GRU,
         TGFPRO PRO,
         TSICID CID,
         VGFCAB VCA
    WHERE CAB.CODTIPOPER = TOP.CODTIPOPER
      AND CAB.DHTIPOPER = TOP.DHALTER
      AND CAB.NUNOTA = ITE.NUNOTA
      AND CAB.CODPARC = PAR.CODPARC
      AND PRO.CODPROD = ITE.CODPROD
      AND PRO.CODGRUPOPROD = GRU.CODGRUPOPROD
      AND PAR.CODTIPPARC = TPP.CODTIPPARC
      AND PAR.CODCID = CID.CODCID
      AND CAB.TIPMOV IN ('V', 'D')
      AND CAB.STATUSNOTA = 'L' 
      AND CAB.NUNOTA = VCA.NUNOTA
      AND (TOP.GOLSINAL = -1 OR BONIFICACAO='S')
      AND (NOT EXISTS(SELECT 1 FROM TGFVAR VAR WHERE VAR.NUNOTA = ITE.NUNOTA AND VAR.NUNOTAORIG = VAR.NUNOTA AND VAR.SEQUENCIAORIG = ITE.SEQUENCIA))
      AND (TOP.ATUALFINTERC <> 'N' OR TOP.ATUALESTTERC = 'N' OR ITE.TERCEIROS <> 'S')
      AND ITE.SEQUENCIA > 0    
      AND TOP.GOLDEV IN (1,-1)
      AND CAB.DTENTSAI >= TO_DATE('{dt_ini}','DD/MM/YYYY')
      AND CAB.DTENTSAI <= TO_DATE('{dt_fim}','DD/MM/YYYY')
    GROUP BY TO_NUMBER(TO_CHAR(CAB.DTENTSAI, 'DD')), CAB.CODVEND, UPPER(PRO.MARCA)
    """
    conn = get_db_connection()
    try:
        df = pd.read_sql(sql, conn)
    finally:
        conn.close()

    cached_diario_data[cache_key] = (df, now_ts)
    try:
        df.to_pickle(disk_file)
    except Exception as e:
        print(f"[CACHE DISCO] Erro ao salvar {disk_file}: {e}")
    return df.copy()

def mapear_canal(setor):
    if not isinstance(setor, str):
        return None
    s = setor.strip()
    if s == 'SP':
        return 'VAREJO ESPECIALIZADO - SP'
    elif s in ['NO - ND', 'RJ - MG - ES', 'SUL']:
        return 'VAREJO ESPECIALIZADO REG'
    elif s in ['DISTRIBUIÇÃO', 'DISTRIBUICAO', 'VAGNER LUZ DA S']:
        return 'DISTRIBUIÇÃO'
    elif s == 'COMEX':
        return 'COMEX'
    elif s == 'E-COMMERCE':
        return 'ECOMMERCE'
    return None

def mapear_marca(marca):
    if not isinstance(marca, str):
        return None
    m = marca.upper().strip()
    if 'FORCE' in m:
        return 'FORCE BARBER'
    elif 'BEAUTY' in m or 'MQ B' in m:
        return 'MQ BEAUTY'
    elif 'ESCOVA' in m:
        return 'MQ ESCOVAS'
    elif 'TESOURA' in m:
        return 'MQ TESOURA'
    elif 'MQ PRO' in m or m == 'PRO':
        return 'MQ PRO'
    elif 'PARLUX' in m:
        return 'PARLUX'
    return None

@app.route('/api/diario_canal')
def api_diario_canal():
    try:
        force = request.args.get('refresh') in ('1', 'true', 'True') or request.args.get('force') in ('1', 'true', 'True')
        mes_param = request.args.get('mes', str(datetime.now().month))
        if ',' in mes_param:
            mes = int(mes_param.split(',')[-1].strip())
        else:
            mes = int(mes_param)
        ano = int(request.args.get('ano', datetime.now().year))

        if force:
            cached_diario_data.clear()

        # Mes anterior
        mes_ant = 12 if mes == 1 else mes - 1
        ano_ant = ano - 1 if mes == 1 else ano

        # Ano anterior (mesmo mes)
        mes_yoy = mes
        ano_yoy = ano - 1

        _, df_setores = carregar_metas_e_setores(mes, ano, force_refresh=force)
        dict_setores = dict(zip(df_setores['CODVEND'], df_setores['SETOR']))

        df_atual = carregar_dados_diarios_sankhya(mes, ano, force_refresh=force)
        df_ant = carregar_dados_diarios_sankhya(mes_ant, ano_ant, force_refresh=force)
        df_yoy = carregar_dados_diarios_sankhya(mes_yoy, ano_yoy, force_refresh=force)

        for df in [df_atual, df_ant, df_yoy]:
            df['CANAL'] = df['CODVEND'].map(dict_setores).apply(mapear_canal)

        canais_lista = [
            'VAREJO ESPECIALIZADO - SP',
            'VAREJO ESPECIALIZADO REG',
            'DISTRIBUIÇÃO',
            'COMEX',
            'ECOMMERCE',
            'EMPRESA'
        ]

        now = datetime.now()
        _, num_dias_mes = calendar.monthrange(ano, mes)
        if ano < now.year or (ano == now.year and mes < now.month):
            dia_atual = num_dias_mes
        else:
            dia_atual = min(now.day, num_dias_mes)

        resultado = []
        for canal in canais_lista:
            is_emp = (canal == 'EMPRESA')
            
            def processar_serie(df_source):
                if is_emp:
                    df_c = df_source
                else:
                    df_c = df_source[df_source['CANAL'] == canal]
                
                vendas_por_dia = df_c.groupby('DIA')['VALORVENDA'].sum().to_dict()
                acum = 0.0
                serie_acum = []
                serie_diario = []
                for dia in range(1, dia_atual + 1):
                    val_dia = float(vendas_por_dia.get(dia, 0.0))
                    acum += val_dia
                    serie_diario.append(round(val_dia, 2))
                    serie_acum.append(round(acum, 2))
                return serie_acum, serie_diario

            s_atual_acum, s_atual_dia = processar_serie(df_atual)
            s_ant_acum, s_ant_dia = processar_serie(df_ant)
            s_yoy_acum, s_yoy_dia = processar_serie(df_yoy)

            tot_atual = s_atual_acum[-1] if s_atual_acum else 0.0
            tot_ant = s_ant_acum[-1] if s_ant_acum else 0.0
            tot_yoy = s_yoy_acum[-1] if s_yoy_acum else 0.0
            venda_ult_dia = s_atual_dia[-1] if s_atual_dia else 0.0

            mom_pct = round(((tot_atual / tot_ant) - 1) * 100, 1) if tot_ant > 0 else 0.0
            yoy_pct = round(((tot_atual / tot_yoy) - 1) * 100, 1) if tot_yoy > 0 else 0.0
            media_dia = round(tot_atual / dia_atual, 2) if dia_atual > 0 else 0.0

            resultado.append({
                "canal": canal,
                "dias": list(range(1, dia_atual + 1)),
                "mes_atual": s_atual_acum,
                "mes_anterior": s_ant_acum,
                "ano_anterior": s_yoy_acum,
                "diario_atual": s_atual_dia,
                "diario_anterior": s_ant_dia,
                "diario_ano_anterior": s_yoy_dia,
                "kpis": {
                    "total_atual": tot_atual,
                    "total_anterior": tot_ant,
                    "total_yoy": tot_yoy,
                    "venda_ultimo_dia": venda_ult_dia,
                    "dia_ultimo": dia_atual,
                    "var_mom_pct": mom_pct,
                    "var_yoy_pct": yoy_pct,
                    "media_diaria": media_dia
                }
            })

        return jsonify({"success": True, "data": resultado})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/diario_marcas')
def api_diario_marcas():
    try:
        force = request.args.get('refresh') in ('1', 'true', 'True') or request.args.get('force') in ('1', 'true', 'True')
        if force:
            cached_diario_data.clear()
        mes_param = request.args.get('mes', str(datetime.now().month))
        if ',' in mes_param:
            mes = int(mes_param.split(',')[-1].strip())
        else:
            mes = int(mes_param)
        ano = int(request.args.get('ano', datetime.now().year))

        mes_ant = 12 if mes == 1 else mes - 1
        ano_ant = ano - 1 if mes == 1 else ano

        mes_yoy = mes
        ano_yoy = ano - 1

        df_atual = carregar_dados_diarios_sankhya(mes, ano, force_refresh=force)
        df_ant = carregar_dados_diarios_sankhya(mes_ant, ano_ant, force_refresh=force)
        df_yoy = carregar_dados_diarios_sankhya(mes_yoy, ano_yoy, force_refresh=force)

        for df in [df_atual, df_ant, df_yoy]:
            df['MARCA_MAP'] = df['MARCA'].apply(mapear_marca)

        marcas_lista = [
            'FORCE BARBER',
            'MQ BEAUTY',
            'MQ ESCOVAS',
            'MQ TESOURA',
            'MQ PRO',
            'PARLUX'
        ]

        now = datetime.now()
        _, num_dias_mes = calendar.monthrange(ano, mes)
        if ano < now.year or (ano == now.year and mes < now.month):
            dia_atual = num_dias_mes
        else:
            dia_atual = min(now.day, num_dias_mes)

        resultado = []
        for marca in marcas_lista:
            def processar_serie_marca(df_source):
                df_m = df_source[df_source['MARCA_MAP'] == marca]
                vendas_por_dia = df_m.groupby('DIA')['VALORVENDA'].sum().to_dict()
                acum = 0.0
                serie_acum = []
                serie_diario = []
                for dia in range(1, dia_atual + 1):
                    val_dia = float(vendas_por_dia.get(dia, 0.0))
                    acum += val_dia
                    serie_diario.append(round(val_dia, 2))
                    serie_acum.append(round(acum, 2))
                return serie_acum, serie_diario

            s_atual_acum, s_atual_dia = processar_serie_marca(df_atual)
            s_ant_acum, s_ant_dia = processar_serie_marca(df_ant)
            s_yoy_acum, s_yoy_dia = processar_serie_marca(df_yoy)

            tot_atual = s_atual_acum[-1] if s_atual_acum else 0.0
            tot_ant = s_ant_acum[-1] if s_ant_acum else 0.0
            tot_yoy = s_yoy_acum[-1] if s_yoy_acum else 0.0
            venda_ult_dia = s_atual_dia[-1] if s_atual_dia else 0.0

            mom_pct = round(((tot_atual / tot_ant) - 1) * 100, 1) if tot_ant > 0 else 0.0
            yoy_pct = round(((tot_atual / tot_yoy) - 1) * 100, 1) if tot_yoy > 0 else 0.0
            media_dia = round(tot_atual / dia_atual, 2) if dia_atual > 0 else 0.0

            resultado.append({
                "marca": marca,
                "dias": list(range(1, dia_atual + 1)),
                "mes_atual": s_atual_acum,
                "mes_anterior": s_ant_acum,
                "ano_anterior": s_yoy_acum,
                "diario_atual": s_atual_dia,
                "diario_anterior": s_ant_dia,
                "diario_ano_anterior": s_yoy_dia,
                "kpis": {
                    "total_atual": tot_atual,
                    "total_anterior": tot_ant,
                    "total_yoy": tot_yoy,
                    "venda_ultimo_dia": venda_ult_dia,
                    "dia_ultimo": dia_atual,
                    "var_mom_pct": mom_pct,
                    "var_yoy_pct": yoy_pct,
                    "media_diaria": media_dia
                }
            })

        return jsonify({"success": True, "data": resultado})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/indicadores/mensal')
def alias_indicadores_mensal():
    return api_vendas_tv()

@app.route('/api/indicadores/acumulado')
def alias_indicadores_acumulado():
    return api_acumulado_tv()


import threading
from datetime import date
from dateutil.relativedelta import relativedelta
import pandas as pd

CACHE_HISTORICO_VENDAS = {
    'df': None,
    'mes_atual': None
}
lock_historico = threading.Lock()

@app.route('/api/estoque')

def api_estoque():
    from datetime import datetime, date
    from dateutil.relativedelta import relativedelta
    import pandas as pd
    
    try:
        hoje = date.today()
        meses_nomes = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ']

        global CACHE_HISTORICO_VENDAS
        
        with lock_historico:
            precisa_atualizar_historico = (
                CACHE_HISTORICO_VENDAS['df'] is None or 
                CACHE_HISTORICO_VENDAS['mes_atual'] != hoje.month
            )

        SQL_PATH_ESTOQUE = os.path.join(os.path.dirname(__file__), 'query', 'estoque.sql')
        with open(SQL_PATH_ESTOQUE, "r", encoding="utf-8") as f:
            sql_query_base = f.read()

        conn = get_db_connection()
        try:
            if precisa_atualizar_historico:
                # Buscar histórico (M-6 até último dia de M-1)
                data_inicio_hist_obj = hoje - relativedelta(months=6)
                data_inicio_hist_str = f"01/{data_inicio_hist_obj.month:02d}/{data_inicio_hist_obj.year}"
                
                ultimo_dia_mes_passado = date(hoje.year, hoje.month, 1) - relativedelta(days=1)
                data_fim_hist_str = f"{ultimo_dia_mes_passado.day:02d}/{ultimo_dia_mes_passado.month:02d}/{ultimo_dia_mes_passado.year}"
                
                sql_hist = sql_query_base.replace("TO_DATE('01/01/2018','DD/MM/YYYY')", f"TO_DATE('{data_inicio_hist_str}', 'DD/MM/YYYY')")
                
                query_hist = f"""
                SELECT 
                    CODPROD, PRODUTO, MAX(GRUPO_GERAL) as GRUPO_GERAL, MAX(GRUPO_SINTETICO) as GRUPO_SINTETICO,
                    MAX(GRUPO_ANALITICO) as GRUPO_ANALITICO, MAX(MARCA) as MARCA, TO_CHAR(DTENTSAI, 'YYYY-MM') as MES_ANO,
                    SUM(NVL(QTDVENDIDA, 0) + NVL(QTDBONIFIC, 0) + NVL(QTDDEVOLVIDA, 0)) as VENDA_BONIF
                FROM ({sql_hist})
                WHERE DTENTSAI <= TO_DATE('{data_fim_hist_str}', 'DD/MM/YYYY')
          AND NVL(empresa, 'X') NOT IN ('EKOS - SP', 'GLOBRAL - SP', 'QUALITY - MATRIZ')
          AND NVL(perfil_cli, 'X') NOT IN ('ATEND. DIRETO', 'INDUSTRIA VIDRACEIRA')
          AND NVL(GRUPO_GERAL, 'X') NOT IN ('EMBALAGENS', 'FABRICA', 'SERVICOS', 'SERVIÇOS', 'USO E CONSUMO', 'USO E COMSUMO')
          AND NVL(GRUPO_GERAL, 'X') NOT LIKE 'MAQUINAS P/ IND VIDRAC%'
          AND NVL(GRUPO_GERAL, 'X') NOT LIKE 'MAQUINA P INDUSTRIA DE VIDRO%'
          AND NVL(vendedor, 'X') <> 'MULTIMAQ REPRES'
          AND NVL(MARCA, 'X') <> 'TERMIX'
                GROUP BY CODPROD, PRODUTO, TO_CHAR(DTENTSAI, 'YYYY-MM')
                """
                df_historico = pd.read_sql(query_hist, conn)
                with lock_historico:
                    CACHE_HISTORICO_VENDAS['df'] = df_historico
                    CACHE_HISTORICO_VENDAS['mes_atual'] = hoje.month
            
            with lock_historico:
                df_hist = CACHE_HISTORICO_VENDAS['df'].copy()

            # Buscar apenas o Mês Atual
            data_inicio_atual_str = f"01/{hoje.month:02d}/{hoje.year}"
            sql_atual = sql_query_base.replace("TO_DATE('01/01/2018','DD/MM/YYYY')", f"TO_DATE('{data_inicio_atual_str}', 'DD/MM/YYYY')")
            
            query_atual = f"""
            SELECT 
                CODPROD, PRODUTO, MAX(GRUPO_GERAL) as GRUPO_GERAL, MAX(GRUPO_SINTETICO) as GRUPO_SINTETICO,
                MAX(GRUPO_ANALITICO) as GRUPO_ANALITICO, MAX(MARCA) as MARCA, TO_CHAR(DTENTSAI, 'YYYY-MM') as MES_ANO,
                SUM(NVL(QTDVENDIDA, 0) + NVL(QTDBONIFIC, 0) + NVL(QTDDEVOLVIDA, 0)) as VENDA_BONIF
            FROM ({sql_atual})
            WHERE DTENTSAI <= TO_DATE('{hoje.strftime('%d/%m/%Y')}', 'DD/MM/YYYY')
              AND NVL(empresa, 'X') NOT IN ('EKOS - SP', 'GLOBRAL - SP', 'QUALITY - MATRIZ')
              AND NVL(perfil_cli, 'X') NOT IN ('ATEND. DIRETO', 'INDUSTRIA VIDRACEIRA')
              AND NVL(GRUPO_GERAL, 'X') NOT IN ('EMBALAGENS', 'FABRICA', 'SERVICOS', 'SERVIÇOS', 'USO E CONSUMO', 'USO E COMSUMO', 'SPARE PARTS')
              AND NVL(GRUPO_GERAL, 'X') NOT LIKE 'MAQUINAS P/ IND VIDRAC%'
              AND NVL(GRUPO_GERAL, 'X') NOT LIKE 'MAQUINA P INDUSTRIA DE VIDRO%'
              AND NVL(vendedor, 'X') <> 'MULTIMAQ REPRES'
              AND NVL(MARCA, 'X') <> 'TERMIX'
            GROUP BY CODPROD, PRODUTO, TO_CHAR(DTENTSAI, 'YYYY-MM')
            """
            df_mes_atual = pd.read_sql(query_atual, conn)
            
            # Buscar Estoque
            df_est = pd.read_sql("SELECT CODPROD, CODEMP, SALDO FROM VMQ_ESTLOC2", conn)
            
        finally:
            conn.close()

        # Juntar histórico com o mês atual
        df_vendas = pd.concat([df_hist, df_mes_atual], ignore_index=True)

        if df_vendas.empty:
            return jsonify({'success': True, 'meses': [], 'data': []})

        # Processar Vendas agregadas
        df_vendas['MES_ANO'] = pd.to_datetime(df_vendas['MES_ANO']).dt.to_period('M')

        df_pivot = df_vendas.pivot_table(index=['CODPROD', 'PRODUTO'], columns='MES_ANO', values='VENDA_BONIF', aggfunc='sum', fill_value=0).reset_index()
        
        # Mapear GRUPO_GERAL, GRUPO_SINTETICO, GRUPO_ANALITICO, MARCA
        df_grupos = df_vendas[['CODPROD', 'GRUPO_GERAL', 'GRUPO_SINTETICO', 'GRUPO_ANALITICO', 'MARCA']].drop_duplicates()
        df_pivot = pd.merge(df_pivot, df_grupos, on='CODPROD', how='left')

        meses = []
        meses_cols = []
        meses_para_media = []
        
        # Exibir 5 meses (M-4 até M-0). A média usa apenas M-4 a M-1.
        for i in range(4, -1, -1):
            d = hoje - relativedelta(months=i)
            period = pd.Period(f"{d.year}-{d.month:02d}", freq='M')
            mes_nome = meses_nomes[d.month - 1]
            meses.append(f"{mes_nome} {str(d.year)[2:]}")
            
            if period in df_pivot.columns:
                meses_cols.append(period)
            else:
                df_pivot[period] = 0
                meses_cols.append(period)
                
            # O usuário informou que o DAX divide por 4. Pelas nossas contas, 
            # ele pega a soma dos últimos 4 meses fechados (i de 4 até 1).
            if 1 <= i <= 4:
                meses_para_media.append(period)

        # MEDIA CONSUMO = média dos últimos 6 meses fechados, usando round para bater com o BI
        df_pivot['MEDIA_CONSUMO'] = df_pivot[meses_para_media].mean(axis=1).round().fillna(0).astype(int)

        # Agrupar Estoque Empresa Global
        df_est_total = df_est.groupby('CODPROD')['SALDO'].sum().reset_index()
        df_est_total.rename(columns={'SALDO': 'ESTOQUE_EMPRESA'}, inplace=True)

        # Agrupar Estoque MCR (CODEMP = 2)
        df_est_mcr = df_est[df_est['CODEMP'] == 2].groupby('CODPROD')['SALDO'].sum().reset_index()
        df_est_mcr.rename(columns={'SALDO': 'ESTOQUE_MCR'}, inplace=True)

        # Merge Vendas e Estoques
        df_final = pd.merge(df_pivot, df_est_total, on='CODPROD', how='left')
        df_final = pd.merge(df_final, df_est_mcr, on='CODPROD', how='left')

        df_final['ESTOQUE_EMPRESA'] = df_final['ESTOQUE_EMPRESA'].fillna(0)
        df_final['ESTOQUE_MCR'] = df_final['ESTOQUE_MCR'].fillna(0)

        # Dias Estoque
        df_final['DIAS_ESTOQUE'] = 0
        mask = df_final['MEDIA_CONSUMO'] > 0
        df_final.loc[mask, 'DIAS_ESTOQUE'] = ((df_final.loc[mask, 'ESTOQUE_EMPRESA'] / df_final.loc[mask, 'MEDIA_CONSUMO']) * 30).round().astype(int)

        # Cálculo de Curva ABC baseado no Volume de Consumo Médio
        df_final['CURVA'] = 'C'
        df_final.sort_values(by='MEDIA_CONSUMO', ascending=False, inplace=True)
        total_consumo = df_final['MEDIA_CONSUMO'].sum()
        if total_consumo > 0:
            df_final['CUM_SUM'] = df_final['MEDIA_CONSUMO'].cumsum()
            df_final['CUM_PERC'] = df_final['CUM_SUM'] / total_consumo
            df_final.loc[df_final['CUM_PERC'] <= 0.8, 'CURVA'] = 'A'
            df_final.loc[(df_final['CUM_PERC'] > 0.8) & (df_final['CUM_PERC'] <= 0.95), 'CURVA'] = 'B'

        # Giro do Estoque = [SOMA SALDO ESTOQUE] / [CONSUMO MEDIO]
        df_final['GIRO'] = 0.0
        df_final.loc[mask, 'GIRO'] = (df_final.loc[mask, 'ESTOQUE_EMPRESA'] / df_final.loc[mask, 'MEDIA_CONSUMO']).round(2)

        data = []
        for _, row in df_final.iterrows():
            vendas = [int(row[col]) for col in meses_cols]
            
            p_data = {
                'cod': str(row['CODPROD']),
                'nome': str(row['PRODUTO']),
                'categoria': str(row.get('GRUPO_SINTETICO', 'Sem Categoria')), # Trocado para SINTETICO a pedido do usuario
                'grupo_geral': str(row.get('GRUPO_GERAL', '')),
                'grupo_analitico': str(row.get('GRUPO_ANALITICO', '')),
                'marca': str(row.get('MARCA', '')),
                'curva': str(row['CURVA']),
                'vendas': vendas,
                'media': int(row['MEDIA_CONSUMO']),
                'estoque_emp': int(row['ESTOQUE_EMPRESA']),
                'dias_estoque': int(row['DIAS_ESTOQUE']),
                'estoque_mcr': int(row['ESTOQUE_MCR']),
                'giro': float(row['GIRO']),
                'tt_transferir': 0
            }
            data.append(p_data)
            
        return jsonify({
            'success': True,
            'meses': meses,
            'data': data
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/refresh')
def api_refresh():
    try:
        ano = request.args.get('ano', type=int)
        invalidar_todos_os_caches(ano)
        return jsonify({'success': True, 'message': f'Caches invalidados com sucesso (ano={ano})'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

def loop_atualizacao_cache_background():
    """Mantém todos os caches do dashboard sempre quentes em background (a cada 10 minutos).
    
    Dessa forma, quando a TV ou qualquer usuário alternar entre as 18 guias,
    todos os dados são servidos instantaneamente da memória (< 50ms) sem travar o navegador.
    """
    time.sleep(2)  # Aguarda o Flask iniciar o servidor
    while True:
        try:
            now = datetime.now()
            ano = now.year
            mes = now.month
            print(f"[CACHE AUTO-REFRESH] Ciclo de atualização de background iniciado ({mes:02d}/{ano})...")
            
            # 1. Vendas do ano e painel mensal
            carregar_ano_completo_no_cache(ano)
            
            # 2. Categorias e Marcas
            try:
                obter_dados_categorias_marcas(mes, ano)
            except Exception as e:
                print(f"[CACHE AUTO-REFRESH] Erro categorias {mes}/{ano}: {e}")
            
            mes_ant = 12 if mes == 1 else mes - 1
            ano_ant = ano - 1 if mes == 1 else ano
            try:
                obter_dados_categorias_marcas(mes_ant, ano_ant)
            except Exception as e:
                pass
                
            # 3. Países (COMEX)
            try:
                obter_dados_paises(mes, ano)
                obter_dados_paises(mes_ant, ano)
            except Exception as e:
                print(f"[CACHE AUTO-REFRESH] Erro paises {ano}: {e}")
                
            # 4. Dados Diários
            try:
                carregar_dados_diarios_sankhya(mes, ano)
                carregar_dados_diarios_sankhya(mes_ant, ano_ant)
            except Exception as e:
                print(f"[CACHE AUTO-REFRESH] Erro dados diarios: {e}")
                
            # 5. Estoque Previsão e Teste Estoque
            try:
                obter_dados_estoque_previsao()
            except Exception as e:
                print(f"[CACHE AUTO-REFRESH] Erro estoque previsao: {e}")
                
            try:
                obter_dados_teste_estoque()
            except Exception as e:
                print(f"[CACHE AUTO-REFRESH] Erro teste estoque: {e}")
                
            print(f"[CACHE AUTO-REFRESH] Ciclo concluído com sucesso. Próxima checagem em 10 minutos.")
        except Exception as e:
            print(f"[CACHE AUTO-REFRESH] Erro no ciclo de background: {e}")
            
        time.sleep(600)  # Checa/atualiza a cada 10 minutos

threading.Thread(target=loop_atualizacao_cache_background, daemon=True).start()

if __name__ == '__main__':
    # PORT permite subir uma segunda instancia (homologacao) sem derrubar a
    # que estiver no ar atendendo as TVs.
    porta = int(os.getenv('PORT', '5050'))
    app.run(host='0.0.0.0', port=porta, debug=False, threaded=True)



