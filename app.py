import calendar
import time
import oracledb
import pandas as pd
from flask import Flask, render_template, jsonify, request, redirect
from datetime import datetime
import threading
import os
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(env_path)

app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@app.after_request
def add_header(response):
    if request.path.startswith('/static/'):
        response.headers['Cache-Control'] = 'public, max-age=86400'
    else:
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

# Configurações do Banco Oracle
DB_USER = os.getenv("ORACLE_USER", "")
DB_PASS = os.getenv("ORACLE_PASSWORD", "")
DB_DSN = os.getenv("ORACLE_DSN", "")

EXCEL_METAS_PATH = os.path.join(os.path.dirname(__file__), 'data', 'meta.xlsx')
SQL_PATH = os.path.join(os.path.dirname(__file__), 'query', 'vendas_vendedor_gerente.sql')

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

cached_df_metas = None
cached_df_setores = None
last_excel_read = 0

def carregar_metas_e_setores(mes, ano):
    global cached_df_metas, cached_df_setores, last_excel_read
    
    if cached_df_metas is None or time.time() - last_excel_read > 1800:
        cached_df_metas = pd.read_excel(EXCEL_METAS_PATH, sheet_name='TABELA METAS MQ GERAL')
        cached_df_metas.columns = cached_df_metas.columns.str.strip().str.upper()
        
        cached_df_setores = pd.read_excel(EXCEL_METAS_PATH, sheet_name='BASE SETORES')
        cached_df_setores.columns = cached_df_setores.columns.str.strip().str.upper()
        
        last_excel_read = time.time()
        
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

def calcular_metricas_painel(df_vendas, df_metas, df_setores):
    # Merge vendas com BASE SETORES para associar cada vendedor ao seu respectivo SETOR
    df_vendas_setor = pd.merge(df_vendas, df_setores[['CODVEND', 'SETOR', 'VENDEDOR']], on='CODVEND', how='left')

    # 1. VAREJO ESPECIALIZADO - SP (SETOR == 'SP')
    v_sp = float(df_vendas_setor[df_vendas_setor['SETOR'] == 'SP']['TOTAL_PREV'].sum()) if 'SETOR' in df_vendas_setor else 0.0
    m_sp = float(df_metas[df_metas['SETOR'] == 'SP']['META'].sum()) if 'SETOR' in df_metas else 0.0
    p_sp = (v_sp / m_sp * 100) if m_sp > 0 else 0.0

    # 2. VAREJO ESPECIALIZADO REG. ('NO - ND', 'RJ - MG - ES', 'SUL')
    reg_setores = ['NO - ND', 'RJ - MG - ES', 'SUL']
    v_reg = float(df_vendas_setor[df_vendas_setor['SETOR'].isin(reg_setores)]['TOTAL_PREV'].sum()) if 'SETOR' in df_vendas_setor else 0.0
    m_reg = float(df_metas[df_metas['SETOR'].isin(reg_setores)]['META'].sum()) if 'SETOR' in df_metas else 0.0
    p_reg = (v_reg / m_reg * 100) if m_reg > 0 else 0.0

    # 3. DISTRIBUIÇÃO ('DISTRIBUIÇÃO', 'VAGNER LUZ DA S')
    dist_setores = ['DISTRIBUIÇÃO', 'VAGNER LUZ DA S']
    v_dist = float(df_vendas_setor[df_vendas_setor['SETOR'].isin(dist_setores)]['TOTAL_PREV'].sum()) if 'SETOR' in df_vendas_setor else 0.0
    m_dist = float(df_metas[df_metas['SETOR'].isin(dist_setores)]['META'].sum()) if 'SETOR' in df_metas else 0.0
    p_dist = (v_dist / m_dist * 100) if m_dist > 0 else 0.0

    # 4. COMEX ('COMEX')
    v_comex = float(df_vendas_setor[df_vendas_setor['SETOR'] == 'COMEX']['TOTAL_PREV'].sum()) if 'SETOR' in df_vendas_setor else 0.0
    m_comex = float(df_metas[df_metas['SETOR'] == 'COMEX']['META'].sum()) if 'SETOR' in df_metas else 0.0
    p_comex = (v_comex / m_comex * 100) if m_comex > 0 else 0.0

    # 5. E-COMMERCE (SETOR == 'E-COMMERCE', MARCA != 'PARLUX', METAS VENDEDOR != 'LOJA VTEX PARLUX')
    if 'SETOR' in df_vendas_setor and 'MARCA' in df_vendas_setor:
        mask_ecom_v = (df_vendas_setor['SETOR'] == 'E-COMMERCE') & (df_vendas_setor['MARCA'] != 'PARLUX')
        v_ecom = float(df_vendas_setor[mask_ecom_v]['TOTAL_PREV'].sum())
    else:
        v_ecom = 0.0
    if 'SETOR' in df_metas and 'VENDEDOR' in df_metas:
        mask_ecom_m = (df_metas['SETOR'] == 'E-COMMERCE') & (df_metas['VENDEDOR'] != 'LOJA VTEX PARLUX')
        m_ecom = float(df_metas[mask_ecom_m]['META'].sum())
    else:
        m_ecom = 0.0
    p_ecom = (v_ecom / m_ecom * 100) if m_ecom > 0 else 0.0

    # 6. E-COMMERCE - PARLUX (SETOR == 'E-COMMERCE' E MARCA == 'PARLUX' — exatamente como o Power BI)
    if 'SETOR' in df_vendas_setor and 'MARCA' in df_vendas_setor:
        mask_parlux_v = (df_vendas_setor['SETOR'] == 'E-COMMERCE') & (df_vendas_setor['MARCA'] == 'PARLUX')
        v_parlux = float(df_vendas_setor[mask_parlux_v]['TOTAL_PREV'].sum())
    else:
        v_parlux = 0.0
    if 'VENDEDOR' in df_metas:
        mask_parlux_m = df_metas['VENDEDOR'] == 'LOJA VTEX PARLUX'
        m_parlux = float(df_metas[mask_parlux_m]['META'].sum())
    else:
        m_parlux = 0.0
    p_parlux = (v_parlux / m_parlux * 100) if m_parlux > 0 else 0.0

    # 7. EMPRESA (Total geral de todas as vendas e todas as metas)
    v_empresa = float(df_vendas['TOTAL_PREV'].sum()) if 'TOTAL_PREV' in df_vendas else 0.0
    m_empresa = float(df_metas['META'].sum()) if 'META' in df_metas else 0.0
    p_empresa = (v_empresa / m_empresa * 100) if m_empresa > 0 else 0.0

    return {
        "VAREJO ESPECIALIZADO - SP": {"percentual": round(p_sp, 1), "realizado": v_sp, "meta": m_sp},
        "VAREJO ESPECIALIZADO REG.": {"percentual": round(p_reg, 1), "realizado": v_reg, "meta": m_reg},
        "DISTRIBUIÇÃO": {"percentual": round(p_dist, 1), "realizado": v_dist, "meta": m_dist},
        "COMEX": {"percentual": round(p_comex, 1), "realizado": v_comex, "meta": m_comex},
        "E-COMMERCE": {"percentual": round(p_ecom, 1), "realizado": v_ecom, "meta": m_ecom},
        "E-COMMERCE - MQ": {"percentual": round(p_ecom, 1), "realizado": v_ecom, "meta": m_ecom},
        "E-COMMERCE - PARLUX": {"percentual": round(p_parlux, 1), "realizado": v_parlux, "meta": m_parlux},
        "EMPRESA": {"percentual": round(p_empresa, 1), "realizado": v_empresa, "meta": m_empresa}
    }

def carregar_vendas_ano(ano):
    data_inicio = f"01/01/{ano}"
    data_fim = f"31/12/{ano}"
    d_filter = f"TGFCAB.DTENTSAI >= TO_DATE('{data_inicio}', 'DD/MM/YYYY') AND TGFCAB.DTENTSAI <= TO_DATE('{data_fim}', 'DD/MM/YYYY') AND "
    opt_sql = RAW_SQL_BASE.replace('WHERE TGFCAB.CODTIPOPER = TGFTOP.CODTIPOPER', 'WHERE ' + d_filter + 'TGFCAB.CODTIPOPER = TGFTOP.CODTIPOPER')
    opt_sql = opt_sql.replace("WHERE tgfcab.tipmov='P'", 'WHERE ' + d_filter + "tgfcab.tipmov='P'")

    final_query = f"""
    SELECT TO_NUMBER(TO_CHAR(V.DTENTSAI, 'MM')) as MES,
           V.CODVEND, 
           P.MARCA,
           SUM(V.vendas) as TOTAL_VENDAS, 
           SUM(V.TotalFat) as TOTAL_FAT,
           SUM(V.TotalPrevisto) as TOTAL_PREV
    FROM (
        {opt_sql}
    ) V
    LEFT JOIN VW_MQ_TGFPRO_POWER_BI P ON TO_CHAR(V.codprod) = TO_CHAR(P.CODPROD)
    GROUP BY TO_NUMBER(TO_CHAR(V.DTENTSAI, 'MM')), V.CODVEND, P.MARCA
    """
    conn = get_db_connection()
    try:
        df_ano = pd.read_sql(final_query, conn)
    finally:
        conn.close()
    for c in ['TOTAL_VENDAS', 'TOTAL_FAT', 'TOTAL_PREV']:
        if c in df_ano.columns:
            df_ano[c] = pd.to_numeric(df_ano[c], errors='coerce').fillna(0.0)
    return df_ano

cached_painel_results = {}
anos_carregados_no_cache = set()

def carregar_ano_completo_no_cache(ano, force=False):
    now_ts = time.time()
    if not force and ano in anos_carregados_no_cache:
        mes_test = f"1_{ano}"
        if mes_test in cached_painel_results and (now_ts - cached_painel_results[mes_test][1] < 1800):
            return
    try:
        print(f"[CACHE] Carregando vendas do ano {ano} completo no Oracle...")
        df_ano = carregar_vendas_ano(ano)
        for m in range(1, 13):
            df_m = df_ano[df_ano['MES'] == m].copy() if len(df_ano) > 0 and 'MES' in df_ano else pd.DataFrame(columns=['CODVEND', 'MARCA', 'TOTAL_VENDAS', 'TOTAL_FAT', 'TOTAL_PREV'])
            df_metas_m, df_setores = carregar_metas_e_setores(m, ano)
            res = calcular_metricas_painel(df_m, df_metas_m, df_setores)
            cached_painel_results[f"{m}_{ano}"] = (res, now_ts)
        anos_carregados_no_cache.add(ano)
        print(f"[CACHE] Ano {ano} carregado com sucesso no cache em memória.")
    except Exception as e:
        print(f"[CACHE] Erro ao carregar ano {ano}: {e}")

def obter_dados_painel(mes, ano, force_refresh=False):
    cache_key = f"{mes}_{ano}"
    now_ts = time.time()
    if not force_refresh and cache_key in cached_painel_results:
        res, ts = cached_painel_results[cache_key]
        if now_ts - ts < 1800: # 30 min cache
            return res

    carregar_ano_completo_no_cache(ano, force=force_refresh)
    if cache_key in cached_painel_results:
        return cached_painel_results[cache_key][0]

    # Fallback individual caso necessário
    df_vendas = get_vendas_do_banco(mes, ano)
    df_metas, df_setores = carregar_metas_e_setores(mes, ano)
    res = calcular_metricas_painel(df_vendas, df_metas, df_setores)
    cached_painel_results[cache_key] = (res, now_ts)
    return res

@app.route('/')
@app.route('/tv')
def dashboard_tv():
    return render_template('index.html')

@app.route('/api/vendas_tv')
def api_vendas_tv():
    try:
        mes = int(request.args.get('mes', datetime.now().month))
        ano = int(request.args.get('ano', datetime.now().year))
        
        mes_ant_m = 12 if mes == 1 else mes - 1
        ano_ant_m = ano - 1 if mes == 1 else ano
        
        mes_ant_y = mes
        ano_ant_y = ano - 1
        
        dados_atual = obter_dados_painel(mes, ano)
        dados_mes_ant = obter_dados_painel(mes_ant_m, ano_ant_m)
        dados_ano_ant = obter_dados_painel(mes_ant_y, ano_ant_y)
        
        equipes = []
        setores = [
            "VAREJO ESPECIALIZADO - SP",
            "VAREJO ESPECIALIZADO REG.",
            "DISTRIBUIÇÃO",
            "COMEX",
            "E-COMMERCE",
            "E-COMMERCE - PARLUX",
            "EMPRESA"
        ]
        
        for setor in setores:
            atual = dados_atual.get(setor, {"percentual": 0, "realizado": 0, "meta": 0})
            ant_m = dados_mes_ant.get(setor, {"percentual": 0, "realizado": 0, "meta": 0})
            ant_y = dados_ano_ant.get(setor, {"percentual": 0, "realizado": 0, "meta": 0})
            
            real_atual = atual['realizado']
            real_ant_m = ant_m['realizado']
            real_ant_y = ant_y['realizado']
            
            mom = ((real_atual / real_ant_m) - 1) * 100 if real_ant_m > 0 else (100 if real_atual > 0 else 0)
            yoy = ((real_atual / real_ant_y) - 1) * 100 if real_ant_y > 0 else (100 if real_atual > 0 else 0)
            
            display_name = "E-COMMERCE - MQ" if setor == "E-COMMERCE" else setor
            equipes.append({
                "name": display_name,
                "percent": atual['percentual'],
                "realizado": atual['realizado'],
                "meta": atual['meta'],
                "prev_month_percent": ant_m['percentual'],
                "prev_year_percent": ant_y['percentual'],
                "mom": round(mom, 1),
                "yoy": round(yoy, 1)
            })
            
        return jsonify({"success": True, "data": equipes})
        
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
        mes = int(request.args.get('mes', datetime.now().month))
        ano = int(request.args.get('ano', datetime.now().year))
        
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
            dados_mes = obter_dados_painel(m, ano)
            
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

@app.route('/trimestre')
def dashboard_trimestre():
    return render_template('trimestre.html')

@app.route('/api/trimestre_tv')
def api_trimestre_tv():
    try:
        mes = int(request.args.get('mes', datetime.now().month))
        ano = int(request.args.get('ano', datetime.now().year))
        
        # 1º Trimestre: Jan, Fev, Mar (1, 2, 3)
        real_t1 = 0.0
        meta_t1 = 0.0
        for m in [1, 2, 3]:
            d = obter_dados_painel(m, ano).get("EMPRESA", {"realizado": 0.0, "meta": 0.0})
            real_t1 += d["realizado"]
            meta_t1 += d["meta"]
        pct_t1 = round((real_t1 / meta_t1 * 100), 1) if meta_t1 > 0 else 0.0
        diff_t1 = round(pct_t1 - 100.0, 1)

        # 2º Trimestre: Abr, Mai, Jun (4, 5, 6)
        real_t2 = 0.0
        meta_t2 = 0.0
        for m in [4, 5, 6]:
            d = obter_dados_painel(m, ano).get("EMPRESA", {"realizado": 0.0, "meta": 0.0})
            real_t2 += d["realizado"]
            meta_t2 += d["meta"]
        pct_t2 = round((real_t2 / meta_t2 * 100), 1) if meta_t2 > 0 else 0.0
        diff_t2 = round(pct_t2 - 100.0, 1)

        # 3º Trimestre: Jul, Ago, Set (7, 8, 9)
        real_t3 = 0.0
        meta_t3 = 0.0
        for m in [7, 8, 9]:
            d = obter_dados_painel(m, ano).get("EMPRESA", {"realizado": 0.0, "meta": 0.0})
            real_t3 += d["realizado"]
            meta_t3 += d["meta"]
        pct_t3 = round((real_t3 / meta_t3 * 100), 1) if meta_t3 > 0 else 0.0
        diff_t3 = round(pct_t3 - 100.0, 1)

        # Mês Atual: mes selecionado
        d_atual = obter_dados_painel(mes, ano).get("EMPRESA", {"realizado": 0.0, "meta": 0.0, "percentual": 0.0})
        pct_atual = round(d_atual["percentual"], 1)
        diff_atual = round(pct_atual - 100.0, 1)

        # Semestre / Acumulado YTD: 1 até mes
        real_sem = 0.0
        meta_sem = 0.0
        for m in range(1, mes + 1):
            d = obter_dados_painel(m, ano).get("EMPRESA", {"realizado": 0.0, "meta": 0.0})
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
        ano = int(request.args.get('ano', datetime.now().year))
        meses_param = request.args.get('meses') or request.args.get('mes')
        
        if meses_param:
            if ',' in str(meses_param):
                meses_list = [int(m.strip()) for m in str(meses_param).split(',') if m.strip().isdigit() and 1 <= int(m.strip()) <= 12]
            else:
                m_single = int(meses_param)
                meses_list = [m_single]
        else:
            meses_list = [datetime.now().month]

        if not meses_list:
            meses_list = [datetime.now().month]
            
        meses_list.sort()

        ref_mes = meses_list[-1]
        d_ref = obter_dados_painel(ref_mes, ano).get("EMPRESA", {"realizado": 0.0, "meta": 0.0, "percentual": 0.0})
        
        real_sel = 0.0
        meta_sel = 0.0
        for m in meses_list:
            d = obter_dados_painel(m, ano).get("EMPRESA", {"realizado": 0.0, "meta": 0.0})
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
            d_ant = obter_dados_painel(m, ano - 1).get("EMPRESA", {"realizado": 0.0, "meta": 0.0})
            real_sel_ant += d_ant.get("realizado", 0.0)
            meta_sel_ant += d_ant.get("meta", 0.0)
        pct_sel_ant = round((real_sel_ant / meta_sel_ant * 100), 1) if meta_sel_ant > 0 else 0.0
        yoy_acum = round(((real_sel / real_sel_ant) - 1) * 100, 1) if real_sel_ant > 0 else (100.0 if real_sel > 0 else 0.0)

        # 2. MÊS ATUAL: Sempre o mês atual do calendário real (não responsivo ao filtro de meses)
        now = datetime.now()
        mes_atual = now.month
        d_mes_atual = obter_dados_painel(mes_atual, ano).get("EMPRESA", {"realizado": 0.0, "meta": 0.0, "percentual": 0.0})
        pct_mes = round(d_mes_atual.get("percentual", 0.0), 1)
        diff_mes = round(pct_mes - 100.0, 1)
        real_mes = d_mes_atual.get("realizado", 0.0)
        meta_mes = d_mes_atual.get("meta", 0.0)

        mes_ant_m = 12 if mes_atual == 1 else mes_atual - 1
        ano_ant_m = ano - 1 if mes_atual == 1 else ano
        d_mes_ant = obter_dados_painel(mes_ant_m, ano_ant_m).get("EMPRESA", {"realizado": 0.0, "meta": 0.0, "percentual": 0.0})
        d_ano_ant = obter_dados_painel(mes_atual, ano - 1).get("EMPRESA", {"realizado": 0.0, "meta": 0.0, "percentual": 0.0})

        real_ant_m = d_mes_ant.get("realizado", 0.0)
        real_ant_y = d_ano_ant.get("realizado", 0.0)
        mom_mes = round(((real_mes / real_ant_m) - 1) * 100, 1) if real_ant_m > 0 else (100.0 if real_mes > 0 else 0.0)
        yoy_mes = round(((real_mes / real_ant_y) - 1) * 100, 1) if real_ant_y > 0 else (100.0 if real_mes > 0 else 0.0)

        return jsonify({
            "success": True,
            "data": {
                "mes": {
                    "percent": pct_mes,
                    "diff": diff_mes,
                    "realizado": real_mes,
                    "meta": meta_mes,
                    "prev_month_percent": d_mes_ant.get("percentual", 0.0),
                    "prev_year_percent": d_ano_ant.get("percentual", 0.0),
                    "mom": mom_mes,
                    "yoy": yoy_mes,
                    "atingiu_meta": pct_mes >= 100.0
                },
                "acumulado": {
                    "percent": pct_acum,
                    "diff": diff_acum,
                    "realizado": real_acum,
                    "meta": meta_acum,
                    "prev_year_percent": pct_sel_ant,
                    "yoy": yoy_acum,
                    "atingiu_meta": pct_acum >= 100.0
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

@app.route('/paises')
def paises():
    return render_template('paises.html')

@app.route('/estoque_previsao')
def estoque_previsao():
    return render_template('estoque_previsao.html')

cached_categorias_data = {}

def obter_dados_categorias_marcas(mes, ano):
    cache_key = f"{ano}_{mes}"
    now_ts = time.time()
    if cache_key in cached_categorias_data:
        data, ts = cached_categorias_data[cache_key]
        if now_ts - ts < 1800:
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

    dt_ini = f"01/01/{ano_ref - 1}"
    dt_fim = f"31/12/{ano_ref}"

    d_filter = f"TGFCAB.DTENTSAI >= TO_DATE('{dt_ini}', 'DD/MM/YYYY') AND TGFCAB.DTENTSAI <= TO_DATE('{dt_fim}', 'DD/MM/YYYY') AND "
    opt_sql = RAW_SQL_BASE.replace('WHERE TGFCAB.CODTIPOPER = TGFTOP.CODTIPOPER', 'WHERE ' + d_filter + 'TGFCAB.CODTIPOPER = TGFTOP.CODTIPOPER')
    opt_sql = opt_sql.replace("WHERE tgfcab.tipmov='P'", 'WHERE ' + d_filter + "tgfcab.tipmov='P'")

    query = f"""
    SELECT 
        TO_NUMBER(TO_CHAR(V.DTENTSAI, 'YYYY')) AS ANO,
        TO_NUMBER(TO_CHAR(V.DTENTSAI, 'MM')) AS MES,
        V.CODVEND,
        NVL(TRIM(P.GRUPO_ANALITICO), 'OUTROS') AS CATEGORIA,
        NVL(TRIM(P.MARCA), 'OUTRAS') AS MARCA,
        SUM(V.TotalPrevisto) AS TOTAL_PREV,
        SUM(V.TotalFat) AS TOTAL_FAT
    FROM ({opt_sql}) V
    LEFT JOIN VW_MQ_TGFPRO_POWER_BI P ON TO_CHAR(V.codprod) = TO_CHAR(P.CODPROD)
    GROUP BY TO_NUMBER(TO_CHAR(V.DTENTSAI, 'YYYY')), TO_NUMBER(TO_CHAR(V.DTENTSAI, 'MM')), V.CODVEND, NVL(TRIM(P.GRUPO_ANALITICO), 'OUTROS'), NVL(TRIM(P.MARCA), 'OUTRAS')
    """

    conn = get_db_connection()
    try:
        df = pd.read_sql(query, conn)
    finally:
        conn.close()

    _, df_setores = carregar_metas_e_setores(mes_ref, ano_ref)
    df_setores_clean = df_setores[['CODVEND', 'SETOR']].drop_duplicates(subset=['CODVEND'])
    df = pd.merge(df, df_setores_clean, on='CODVEND', how='left')

    def mapear_canal_venda(row):
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

    df['CANAL'] = df.apply(mapear_canal_venda, axis=1)

    def calcular_dimensao(dim_col):
        pivot = df.groupby(['ANO', 'MES', dim_col])['TOTAL_PREV'].sum().reset_index()

        ranks = {}
        vlrs = {}
        totals = {}

        for (a, m), grp in pivot.groupby(['ANO', 'MES']):
            s = grp.sort_values('TOTAL_PREV', ascending=False).reset_index(drop=True)
            s['RANK'] = s.index + 1
            ranks[(a, m)] = s.set_index(dim_col)['RANK'].to_dict()
            vlrs[(a, m)] = s.set_index(dim_col)['TOTAL_PREV'].to_dict()
            totals[(a, m)] = float(grp['TOTAL_PREV'].sum())

        df_atual = pivot[(pivot['ANO'] == ano_ref) & (pivot['MES'] == mes_ref)].copy()
        total_empresa = totals.get((ano_ref, mes_ref), 0.0)
        df_atual = df_atual.sort_values('TOTAL_PREV', ascending=False).reset_index(drop=True)
        df_atual['RANK'] = df_atual.index + 1

        linhas = []
        for _, r in df_atual.iterrows():
            item = str(r[dim_col])
            vlr_atual = float(r['TOTAL_PREV'])
            share = round((vlr_atual / total_empresa * 100), 1) if total_empresa > 0 else 0.0
            rank = int(r['RANK'])

            meses_dados = {}
            for m in range(1, 13):
                v_m = float(vlrs.get((ano_ref, m), {}).get(item, 0.0))
                tot_m = totals.get((ano_ref, m), 0.0)
                s_m = round((v_m / tot_m * 100), 1) if tot_m > 0 else 0.0
                r_m = ranks.get((ano_ref, m), {}).get(item)

                prev_m = 12 if m == 1 else m - 1
                prev_a = ano_ref - 1 if m == 1 else ano_ref
                r_prev = ranks.get((prev_a, prev_m), {}).get(item)
                v_prev = float(vlrs.get((prev_a, prev_m), {}).get(item, 0.0))

                delta_r_m = (r_prev - r_m) if (r_prev is not None and r_m is not None) else None
                mom_m = round(((v_m / v_prev) - 1) * 100, 1) if v_prev > 0 else (100.0 if v_m > 0 else 0.0)

                v_yoy = float(vlrs.get((ano_ref - 1, m), {}).get(item, 0.0))
                tot_yoy = totals.get((ano_ref - 1, m), 0.0)
                s_yoy = round((v_yoy / tot_yoy * 100), 1) if tot_yoy > 0 else 0.0
                yoy_m = round(((v_m / v_yoy) - 1) * 100, 1) if v_yoy > 0 else (100.0 if v_m > 0 else 0.0)

                meses_dados[m] = {
                    "faturamento": round(v_m, 2),
                    "share": s_m,
                    "rank": r_m,
                    "delta_rank": delta_r_m,
                    "mom": mom_m,
                    "yoy": yoy_m,
                    "faturamento_ant": round(v_yoy, 2),
                    "share_ant": s_yoy
                }

            r_ref_prev = ranks.get((ano_ant, mes_ant), {}).get(item)
            delta_rank = (r_ref_prev - rank) if (r_ref_prev is not None) else None

            v_ref_prev = float(vlrs.get((ano_ant, mes_ant), {}).get(item, 0.0))
            mom = round(((vlr_atual / v_ref_prev) - 1) * 100, 1) if v_ref_prev > 0 else (100.0 if vlr_atual > 0 else 0.0)

            v_ref_yoy = float(vlrs.get((ano_yoy, mes_ref), {}).get(item, 0.0))
            yoy = round(((vlr_atual / v_ref_yoy) - 1) * 100, 1) if v_ref_yoy > 0 else (100.0 if vlr_atual > 0 else 0.0)

            if rank <= 2:
                status = "Líder"
            elif mom >= 15.0 or (delta_rank is not None and delta_rank >= 2):
                status = "Expansão"
            elif mom <= -15.0 or (delta_rank is not None and delta_rank <= -2):
                status = "Atenção"
            else:
                status = "Estável"

            linhas.append({
                "item": item,
                "faturamento": round(vlr_atual, 2),
                "share": share,
                "rank": rank,
                "rank_ant": r_ref_prev,
                "delta_rank": delta_rank,
                "mom": mom,
                "yoy": yoy,
                "meses_dados": meses_dados,
                "status": status
            })

        lider = linhas[0] if len(linhas) > 0 else {"item": "N/A", "faturamento": 0.0, "share": 0.0, "rank": 1, "mom": 0.0, "delta_rank": 0, "yoy": 0.0}
        min_vlr = max(10000.0, total_empresa * 0.005)
        itens_relevantes = [x for x in linhas if (x.get("faturamento") or 0) >= min_vlr]
        if not itens_relevantes:
            itens_relevantes = linhas

        top_growth = max(itens_relevantes, key=lambda x: (x.get("mom") if x.get("mom") is not None else -999999)) if itens_relevantes else lider
        itens_com_delta = [x for x in itens_relevantes if x.get("delta_rank") is not None]
        top_mover = max(itens_com_delta, key=lambda x: (x.get("delta_rank") if x.get("delta_rank") is not None else -999999)) if itens_com_delta else lider
        warning = min(itens_relevantes, key=lambda x: (x.get("mom") if x.get("mom") is not None else 999999)) if itens_relevantes else lider

        summary = {
            "lider": {
                "nome": lider.get("item", "N/A"),
                "faturamento": lider.get("faturamento", 0.0),
                "share": lider.get("share", 0.0),
                "rank": lider.get("rank", 1)
            },
            "top_growth": {
                "nome": top_growth.get("item", "N/A"),
                "mom": top_growth.get("mom", 0.0),
                "faturamento": top_growth.get("faturamento", 0.0)
            },
            "top_mover": {
                "nome": top_mover.get("item", "N/A"),
                "delta": top_mover.get("delta_rank", 0),
                "rank": top_mover.get("rank", 1),
                "faturamento": top_mover.get("faturamento", 0.0)
            },
            "warning": {
                "nome": warning.get("item", "N/A"),
                "mom": warning.get("mom", 0.0),
                "faturamento": warning.get("faturamento", 0.0)
            }
        }

        return linhas, total_empresa, summary

    cat_linhas, total_cat, cat_summary = calcular_dimensao('CATEGORIA')
    marca_linhas, total_marca, marca_summary = calcular_dimensao('MARCA')
    canal_linhas, total_canal, canal_summary = calcular_dimensao('CANAL')

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

    resultado = {
        "mes": mes_ref,
        "ano": ano_ref,
        "mes_solicitado": mes,
        "mes_nome": nomes_meses_br[mes_ref],
        "meses_colunas": meses_colunas,
        "total_faturamento": round(total_cat, 2),
        "labels_6m": labels_6m,
        "categorias": cat_linhas,
        "marcas": marca_linhas,
        "canais": canal_linhas_ordenado,
        "summary_categoria": cat_summary,
        "summary_marca": marca_summary,
        "summary_canal": canal_summary
    }

    cached_categorias_data[cache_key] = (resultado, now_ts)
    return resultado

@app.route('/api/categorias_dados')
def api_categorias_dados():
    try:
        now = datetime.now()
        ultimo_fechado = now.month - 1 if now.month > 1 else 12
        mes_arg = request.args.get('mes')
        mes = int(mes_arg) if mes_arg and mes_arg.isdigit() else ultimo_fechado
        ano = int(request.args.get('ano', now.year))
        
        if request.args.get('refresh') == '1':
            cached_categorias_data.clear()
            
        data = obter_dados_categorias_marcas(mes, ano)
        return jsonify({"success": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})

cached_paises_data = {}

def obter_dados_paises(mes, ano):
    cache_key = f"{ano}_{mes}"
    now_ts = time.time()
    if cache_key in cached_paises_data:
        data, ts = cached_paises_data[cache_key]
        if now_ts - ts < 1800:
            return data

    now = datetime.now()
    if not mes or mes < 1 or mes > 12:
        mes_ref = now.month - 1 if now.month > 1 else 12
    else:
        mes_ref = mes
    ano_ref = ano
    ano_ant = ano_ref - 1

    query = f"""
    SELECT 
        NVL(V.NOME_PAIS, 'NÃO INFORMADO') AS NOME_PAIS,
        V.ANO,
        V.MES,
        SUM(V.CALCULO_LIQUIDO_COM_IPI) AS CALCULO_LIQUIDO_COM_IPI
    FROM (
        SELECT 
            (SELECT descricao FROM tsipai WHERE codpais=(SELECT codpais FROM tsiufs WHERE coduf = (SELECT uf FROM tsicid WHERE codcid=(SELECT codcid FROM tgfpar WHERE codparc=cab.codparc)))) AS NOME_PAIS,
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
          AND CAB.DTENTSAI >= TO_DATE('01/01/{ano_ant}','DD/MM/YYYY')
          AND CAB.DTENTSAI <= TO_DATE('31/12/{ano_ref}','DD/MM/YYYY')
    ) V
    WHERE UPPER(TRIM(NVL(V.NOME_PAIS, 'NÃO INFORMADO'))) NOT IN ('BRASIL', 'NÃO INFORMADO', 'NAO INFORMADO', 'EX')
    GROUP BY V.NOME_PAIS, V.ANO, V.MES
    """

    conn = get_db_connection()
    try:
        df = pd.read_sql(query, conn)
    finally:
        conn.close()

    # Excluir Brasil e registros inválidos (foco 100% em COMEX internacional)
    df['NOME_PAIS'] = df['NOME_PAIS'].astype(str).str.strip().str.upper()
    df = df[~df['NOME_PAIS'].isin(['BRASIL', 'NÃO INFORMADO', 'NAO INFORMADO', 'EX', 'NONE', 'NAN', ''])]

    nomes_meses_br = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    
    pivot = df.groupby(['ANO', 'MES', 'NOME_PAIS'])['CALCULO_LIQUIDO_COM_IPI'].sum().reset_index()

    ranks = {}
    vlrs = {}
    totals = {}

    for (a, m), grp in pivot.groupby(['ANO', 'MES']):
        s = grp.sort_values('CALCULO_LIQUIDO_COM_IPI', ascending=False).reset_index(drop=True)
        s['RANK'] = s.index + 1
        ranks[(a, m)] = s.set_index('NOME_PAIS')['RANK'].to_dict()
        vlrs[(a, m)] = s.set_index('NOME_PAIS')['CALCULO_LIQUIDO_COM_IPI'].to_dict()
        totals[(a, m)] = float(grp['CALCULO_LIQUIDO_COM_IPI'].sum())

    df_ano_ref = pivot[pivot['ANO'] == ano_ref].copy()
    if len(df_ano_ref) > 0:
        tot_por_pais = df_ano_ref.groupby('NOME_PAIS')['CALCULO_LIQUIDO_COM_IPI'].sum().to_dict()
        paises_unicos = sorted(list(df_ano_ref['NOME_PAIS'].unique()), key=lambda x: tot_por_pais.get(x, 0), reverse=True)
    else:
        paises_unicos = sorted(list(pivot['NOME_PAIS'].unique()))

    mes_ant = 12 if mes_ref == 1 else mes_ref - 1
    ano_ant_m = ano_ref - 1 if mes_ref == 1 else ano_ref
    ano_yoy = ano_ref - 1

    total_mes_ref = totals.get((ano_ref, mes_ref), 0.0)

    linhas = []
    for idx, item in enumerate(paises_unicos):
        vlr_atual = float(vlrs.get((ano_ref, mes_ref), {}).get(item, 0.0))
        share = round((vlr_atual / total_mes_ref * 100), 1) if total_mes_ref > 0 else 0.0
        rank = idx + 1

        meses_dados = {}
        for m in range(1, 13):
            v_m = float(vlrs.get((ano_ref, m), {}).get(item, 0.0))
            tot_m = totals.get((ano_ref, m), 0.0)
            s_m = round((v_m / tot_m * 100), 2) if tot_m > 0 else 0.0
            r_m = ranks.get((ano_ref, m), {}).get(item)

            prev_m = 12 if m == 1 else m - 1
            prev_a = ano_ref - 1 if m == 1 else ano_ref
            r_prev = ranks.get((prev_a, prev_m), {}).get(item)
            v_prev = float(vlrs.get((prev_a, prev_m), {}).get(item, 0.0))

            delta_r_m = (r_prev - r_m) if (r_prev is not None and r_m is not None) else None
            mom_m = round(((v_m / v_prev) - 1) * 100, 1) if v_prev > 0 else (100.0 if v_m > 0 else 0.0)

            v_yoy = float(vlrs.get((ano_ref - 1, m), {}).get(item, 0.0))
            tot_yoy = totals.get((ano_ref - 1, m), 0.0)
            s_yoy = round((v_yoy / tot_yoy * 100), 2) if tot_yoy > 0 else 0.0
            yoy_m = round(((v_m / v_yoy) - 1) * 100, 1) if v_yoy > 0 else (100.0 if v_m > 0 else 0.0)

            meses_dados[m] = {
                "faturamento": round(v_m, 2),
                "share": s_m,
                "rank": r_m,
                "delta_rank": delta_r_m,
                "mom": mom_m,
                "yoy": yoy_m,
                "faturamento_ant": round(v_yoy, 2),
                "share_ant": s_yoy
            }

        r_ref_prev = ranks.get((ano_ant_m, mes_ant), {}).get(item)
        delta_rank = (r_ref_prev - rank) if (r_ref_prev is not None and rank != 999) else None

        v_ref_prev = float(vlrs.get((ano_ant_m, mes_ant), {}).get(item, 0.0))
        mom = round(((vlr_atual / v_ref_prev) - 1) * 100, 1) if v_ref_prev > 0 else (100.0 if vlr_atual > 0 else 0.0)

        v_ref_yoy = float(vlrs.get((ano_yoy, mes_ref), {}).get(item, 0.0))
        yoy = round(((vlr_atual / v_ref_yoy) - 1) * 100, 1) if v_ref_yoy > 0 else (100.0 if vlr_atual > 0 else 0.0)

        if rank <= 2:
            status = "Líder"
        elif mom >= 15.0 or (delta_rank is not None and delta_rank >= 2):
            status = "Expansão"
        elif mom <= -15.0 or (delta_rank is not None and delta_rank <= -2):
            status = "Atenção"
        else:
            status = "Estável"

        linhas.append({
            "item": item,
            "faturamento": round(vlr_atual, 2),
            "share": share,
            "rank": rank,
            "rank_ant": r_ref_prev,
            "delta_rank": delta_rank,
            "mom": mom,
            "yoy": yoy,
            "meses_dados": meses_dados,
            "status": status
        })

    meses_colunas = [{"num": m, "label": nomes_meses_br[m]} for m in range(1, 13)]

    resultado = {
        "mes": mes_ref,
        "ano": ano_ref,
        "mes_solicitado": mes,
        "mes_nome": nomes_meses_br[mes_ref],
        "meses_colunas": meses_colunas,
        "total_faturamento": round(total_mes_ref, 2),
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

@app.route('/api/estoque_previsao')
def api_estoque_previsao():
    try:
        conn = get_db_connection()
        query = """
        WITH VENDA_MEDIA AS (
            SELECT 
                ITE.CODPROD,
                SUM(CASE WHEN CAB.DTNEG >= TRUNC(SYSDATE, 'MM') THEN (ITE.QTDNEG * TOP.GOLDEV) ELSE 0 END) AS QTD_VENDAS_MES,
                SUM(ITE.QTDNEG * TOP.GOLDEV) / 3 AS MEDIA_VENDA_TRIMESTRE,
                SUM(ITE.QTDNEG * TOP.GOLDEV) / 90 as VENDA_MEDIA_DIARIA
            FROM TGFCAB CAB
            JOIN TGFITE ITE ON CAB.NUNOTA = ITE.NUNOTA
            JOIN TGFTOP TOP ON CAB.CODTIPOPER = TOP.CODTIPOPER AND TOP.DHALTER = CAB.DHTIPOPER
            WHERE CAB.DTNEG >= SYSDATE - 90
              AND TOP.GOLDEV IN (1, -1)
            GROUP BY ITE.CODPROD
        )
        SELECT 
            EST.CODPROD,
            PROD.DESCRPROD AS NOME_PRODUTO,
            PROD.MARCA,
            EMP.CODEMP,
            EMP.RAZAOABREV AS NOME_EMPRESA,
            PROD.DESCRGRUPOPROD AS CATEGORIA,
            PROD.GRUPO_SINTETICO,
            PROD.GRUPO_ANALITICO,
            EST.SALDO AS SALDO_ESTOQUE,
            NVL(VM.QTD_VENDAS_MES, 0) AS QTD_VENDAS_MES,
            NVL(VM.MEDIA_VENDA_TRIMESTRE, 0) AS MEDIA_VENDA_TRIMESTRE,
            NVL(VM.VENDA_MEDIA_DIARIA, 0) AS VENDA_MEDIA_DIARIA
        FROM VMQ_ESTLOC2 EST
        JOIN VMQ_TSIEMP EMP ON EST.CODEMP = EMP.CODEMP
        JOIN VW_MQ_TGFPRO_POWER_BI PROD ON EST.CODPROD = PROD.CODPROD
        LEFT JOIN VENDA_MEDIA VM ON EST.CODPROD = VM.CODPROD
        WHERE EST.SALDO > 0
        ORDER BY PROD.DESCRPROD ASC
        """
        df = pd.read_sql(query, conn)
        
        # Calcular Dias de Cobertura
        def calc_dias(row):
            if row['VENDA_MEDIA_DIARIA'] > 0:
                return round(row['SALDO_ESTOQUE'] / row['VENDA_MEDIA_DIARIA'])
            else:
                return 9999 # Infinito (sem vendas recentes)
                
        df['DIAS_COBERTURA'] = df.apply(calc_dias, axis=1)
        
        df = df.fillna('')
        data = df.to_dict('records')
        return jsonify({'success': True, 'data': data})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if 'conn' in locals() and conn:
            conn.close()

@app.route('/api/paises_dados')
def api_paises_dados():
    try:
        now = datetime.now()
        ultimo_fechado = now.month - 1 if now.month > 1 else 12
        mes_arg = request.args.get('mes')
        mes = int(mes_arg) if mes_arg and mes_arg.isdigit() else ultimo_fechado
        ano = int(request.args.get('ano', now.year))
        
        if request.args.get('refresh') == '1':
            cached_paises_data.clear()
            
        data = obter_dados_paises(mes, ano)
        return jsonify({"success": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})

# Cache para consultas diárias
cached_diario_data = {}

def carregar_dados_diarios_sankhya(mes, ano):
    cache_key = f"{ano}_{mes}"
    now_ts = time.time()
    if cache_key in cached_diario_data:
        data, ts = cached_diario_data[cache_key]
        if now_ts - ts < 600:
            return data.copy()

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
        mes_param = request.args.get('mes', str(datetime.now().month))
        if ',' in mes_param:
            mes = int(mes_param.split(',')[-1].strip())
        else:
            mes = int(mes_param)
        ano = int(request.args.get('ano', datetime.now().year))

        # Mes anterior
        mes_ant = 12 if mes == 1 else mes - 1
        ano_ant = ano - 1 if mes == 1 else ano

        # Ano anterior (mesmo mes)
        mes_yoy = mes
        ano_yoy = ano - 1

        _, df_setores = carregar_metas_e_setores(mes, ano)
        dict_setores = dict(zip(df_setores['CODVEND'], df_setores['SETOR']))

        df_atual = carregar_dados_diarios_sankhya(mes, ano)
        df_ant = carregar_dados_diarios_sankhya(mes_ant, ano_ant)
        df_yoy = carregar_dados_diarios_sankhya(mes_yoy, ano_yoy)

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

        dia_atual = datetime.now().day

        resultado = []
        for canal in canais_lista:
            # Gerar curva diária acumulada de 1 a dia_atual
            def gerar_acumulado(df_source, is_empresa):
                if is_empresa:
                    df_c = df_source
                else:
                    df_c = df_source[df_source['CANAL'] == canal]
                
                vendas_por_dia = df_c.groupby('DIA')['VALORVENDA'].sum().to_dict()
                acum = 0.0
                serie = []
                for dia in range(1, dia_atual + 1):
                    if dia in vendas_por_dia:
                        acum += vendas_por_dia[dia]
                        serie.append(round(acum, 2))
                    else:
                        serie.append(round(acum, 2) if acum > 0 else 0.0)
                return serie

            is_emp = (canal == 'EMPRESA')
            s_atual = gerar_acumulado(df_atual, is_emp)
            s_ant = gerar_acumulado(df_ant, is_emp)
            s_yoy = gerar_acumulado(df_yoy, is_emp)

            resultado.append({
                "canal": canal,
                "dias": list(range(1, dia_atual + 1)),
                "mes_atual": s_atual,
                "mes_anterior": s_ant,
                "ano_anterior": s_yoy
            })

        return jsonify({"success": True, "data": resultado})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/diario_marcas')
def api_diario_marcas():
    try:
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

        df_atual = carregar_dados_diarios_sankhya(mes, ano)
        df_ant = carregar_dados_diarios_sankhya(mes_ant, ano_ant)
        df_yoy = carregar_dados_diarios_sankhya(mes_yoy, ano_yoy)

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

        dia_atual = datetime.now().day

        resultado = []
        for marca in marcas_lista:
            def gerar_acumulado_marca(df_source):
                df_m = df_source[df_source['MARCA_MAP'] == marca]
                vendas_por_dia = df_m.groupby('DIA')['VALORVENDA'].sum().to_dict()
                acum = 0.0
                serie = []
                for dia in range(1, dia_atual + 1):
                    if dia in vendas_por_dia:
                        acum += vendas_por_dia[dia]
                        serie.append(round(acum, 2))
                    else:
                        serie.append(round(acum, 2) if acum > 0 else 0.0)
                return serie

            s_atual = gerar_acumulado_marca(df_atual)
            s_ant = gerar_acumulado_marca(df_ant)
            s_yoy = gerar_acumulado_marca(df_yoy)

            resultado.append({
                "marca": marca,
                "dias": list(range(1, dia_atual + 1)),
                "mes_atual": s_atual,
                "mes_anterior": s_ant,
                "ano_anterior": s_yoy
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

def aquecer_cache_background():
    try:
        now = datetime.now()
        ano = now.year
        mes = now.month
        print(f"[CACHE WARMUP] Aquecendo cache para o ano {ano}...")
        carregar_ano_completo_no_cache(ano)
        print(f"[CACHE WARMUP] Aquecendo marcas e categorias para {mes}/{ano}...")
        try:
            obter_dados_categorias_marcas(mes, ano)
        except Exception as e:
            print(f"[CACHE WARMUP] Erro categorias {mes}/{ano}: {e}")
        # Também pré-aquecer mês anterior
        mes_ant = 12 if mes == 1 else mes - 1
        ano_ant = ano - 1 if mes == 1 else ano
        try:
            obter_dados_categorias_marcas(mes_ant, ano_ant)
        except Exception as e:
            pass
        print(f"[CACHE WARMUP] Aquecendo paises para {ano}...")
        try:
            obter_dados_paises(mes, ano)
        except Exception as e:
            print(f"[CACHE WARMUP] Erro paises {ano}: {e}")
        print("[CACHE WARMUP] Cache inicial totalmente aquecido!")
    except Exception as e:
        print(f"[CACHE WARMUP] Erro geral no aquecimento: {e}")

threading.Thread(target=aquecer_cache_background, daemon=True).start()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050, debug=False, threaded=True)



