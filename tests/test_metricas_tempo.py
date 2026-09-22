"""
Validação automática das medidas YTD / YoY / MoM.

Roda sem banco: usa uma base fictícia determinística (R$ 100,00 por dia útil e
fim de semana incluso, valor = 100 em 2024 e 200 em 2025), o que torna cada
resultado conferível por aritmética manual.

    python tests/test_metricas_tempo.py          -> executa e imprime o laudo
    python -m pytest tests/test_metricas_tempo.py
"""

import os
import sys
from datetime import date, timedelta

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from metricas_tempo import (  # noqa: E402
    calcular_medidas_tempo,
    clamp_dia,
    data_corte_contexto,
    mes_esta_parcial,
    divide_seguro,
    periodo_ano_anterior_mes,
    periodo_mes_anterior,
    periodo_ytd_ano_anterior,
    somar_periodo,
    tabela_preview,
)

VALOR_DIA = {2023: 50.0, 2024: 100.0, 2025: 200.0, 2026: 300.0}


def base_ficticia(ano_ini=2023, ano_fim=2026):
    """Dimensão de datas CONTÍNUA (sem saltos), um registro por dia."""
    linhas = []
    d = date(ano_ini, 1, 1)
    fim = date(ano_fim, 12, 31)
    while d <= fim:
        linhas.append({"DATA": pd.Timestamp(d), "TOTAL_PREV": VALOR_DIA[d.year]})
        d += timedelta(days=1)
    return pd.DataFrame(linhas)


falhas = []


def checar(nome, obtido, esperado, tol=1e-6):
    if obtido is None or esperado is None:
        ok = obtido is None and esperado is None
    elif isinstance(obtido, (int, float)) and isinstance(esperado, (int, float)) and not isinstance(obtido, bool):
        ok = abs(obtido - esperado) <= tol
    else:
        ok = obtido == esperado
    status = "OK  " if ok else "FALHA"
    print(f"  [{status}] {nome}: obtido={obtido!r} esperado={esperado!r}")
    if not ok:
        falhas.append(nome)
    return ok


# ---------------------------------------------------------------------------
# 1. Divisão por zero / nulo
# ---------------------------------------------------------------------------

def test_divisao_por_zero():
    print("\n1) DIVISÃO POR ZERO E NULOS")
    checar("base zero -> None", divide_seguro(500, 0), None)
    checar("base None -> None", divide_seguro(500, None), None)
    checar("base negativa -> None", divide_seguro(500, -10), None)
    checar("alternativo 0", divide_seguro(500, 0, 0), 0)
    checar("crescimento 100%", divide_seguro(200, 100), 100.0)
    checar("queda 50%", divide_seguro(50, 100), -50.0)
    checar("estável 0%", divide_seguro(100, 100), 0.0)


# ---------------------------------------------------------------------------
# 2. Períodos equivalentes (o bug central do painel)
# ---------------------------------------------------------------------------

def test_periodos_equivalentes():
    print("\n2) INTERVALOS EXATAMENTE EQUIVALENTES")
    corte = date(2025, 9, 22)

    ini, fim = periodo_mes_anterior(corte)
    checar("MoM dias comparados", (fim - ini).days + 1, 22)
    print(f"        mês anterior = {ini} .. {fim}")

    ini_y, fim_y = periodo_ano_anterior_mes(corte)
    checar("YoY dias comparados", (fim_y - ini_y).days + 1, 22)
    print(f"        ano anterior = {ini_y} .. {fim_y}")

    ini_ya, fim_ya = periodo_ytd_ano_anterior(corte)
    checar("YTD ant. termina em 22/09/2024", fim_ya.toordinal(), date(2024, 9, 22).toordinal())

    # Janeiro deve voltar para dezembro do ano anterior
    ini_j, fim_j = periodo_mes_anterior(date(2025, 1, 10))
    checar("jan/2025 -> dez/2024", ini_j.toordinal(), date(2024, 12, 1).toordinal())
    checar("jan/2025 -> corte 10/12", fim_j.toordinal(), date(2024, 12, 10).toordinal())

    # Mês FECHADO compara mês cheio contra mês cheio (PREVIOUSMONTH do DAX):
    # recortar aqui seria erro — fev/2025 perderia 3 dias de janeiro.
    checar("22/09/2025 é parcial", mes_esta_parcial(date(2025, 9, 22)), True)
    checar("30/09/2025 é fechado", mes_esta_parcial(date(2025, 9, 30)), False)
    _, fim_fech = periodo_mes_anterior(date(2025, 2, 28))
    checar("fev fechado -> jan inteiro", fim_fech.toordinal(), date(2025, 1, 31).toordinal())
    _, fim_yfech = periodo_ano_anterior_mes(date(2025, 2, 28))
    checar("fev/2025 fechado -> fev/2024 inteiro (29d)", fim_yfech.toordinal(), date(2024, 2, 29).toordinal())


# ---------------------------------------------------------------------------
# 3. Bissexto e meses curtos
# ---------------------------------------------------------------------------

def test_bissexto_e_meses_curtos():
    print("\n3) BISSEXTO E MESES DE TAMANHOS DIFERENTES")
    checar("29/02/2024 -> 28/02/2023", clamp_dia(2023, 2, 29), 28)
    checar("29/02 existe em 2024", clamp_dia(2024, 2, 29), 29)
    checar("31/03 -> fev/2025 = 28", clamp_dia(2025, 2, 31), 28)
    checar("31/05 -> abr = 30", clamp_dia(2025, 4, 31), 30)

    _, fim = periodo_ano_anterior_mes(date(2024, 2, 29))
    checar("YoY de 29/02/2024 cai em 28/02/2023", fim.toordinal(), date(2023, 2, 28).toordinal())

    _, fim_m = periodo_mes_anterior(date(2025, 3, 31))
    checar("MoM de 31/03/2025 cai em 28/02/2025", fim_m.toordinal(), date(2025, 2, 28).toordinal())


# ---------------------------------------------------------------------------
# 4. Data de corte do contexto
# ---------------------------------------------------------------------------

def test_data_corte():
    print("\n4) DATA DE CORTE DO CONTEXTO")
    hoje = date(2025, 9, 22)
    checar("mês corrente -> hoje", data_corte_contexto(9, 2025, hoje).toordinal(), hoje.toordinal())
    checar("mês fechado -> último dia", data_corte_contexto(8, 2025, hoje).toordinal(), date(2025, 8, 31).toordinal())
    checar("fev bissexto fechado", data_corte_contexto(2, 2024, hoje).toordinal(), date(2024, 2, 29).toordinal())


# ---------------------------------------------------------------------------
# 5. Cálculo manual passo a passo (prova aritmética)
# ---------------------------------------------------------------------------

def test_calculo_manual():
    print("\n5) PROVA MANUAL PASSO A PASSO — corte 22/09/2025")
    df = base_ficticia()
    corte = date(2025, 9, 22)
    m = calcular_medidas_tempo(df, corte)

    # --- Passo 1: MTD = 22 dias de setembro/2025 a R$ 200/dia
    mtd_manual = 22 * 200.0
    print(f"        MTD manual  = 22 dias x 200 = {mtd_manual:,.2f}")
    checar("MTD", m["mtd"], mtd_manual)

    # --- Passo 2: mês anterior = 01..22/ago/2025 (mesmo nº de dias)
    mes_ant_manual = 22 * 200.0
    print(f"        MoM base    = 22 dias x 200 = {mes_ant_manual:,.2f}")
    checar("Mês anterior (mesmo intervalo)", m["mes_anterior"], mes_ant_manual)
    checar("MoM %", m["mom"], 0.0)

    # --- Passo 3: mesmo período de 2024 = 22 dias x 100
    yoy_base_manual = 22 * 100.0
    print(f"        YoY base    = 22 dias x 100 = {yoy_base_manual:,.2f}")
    checar("Mês ano anterior", m["mes_ano_anterior"], yoy_base_manual)
    checar("YoY %", m["yoy"], 100.0)

    # --- Passo 4: YTD = 01/01/2025 .. 22/09/2025
    dias_ytd = (corte - date(2025, 1, 1)).days + 1  # 31+28+31+30+31+30+31+31+22 = 265
    print(f"        Dias YTD    = {dias_ytd} (31+28+31+30+31+30+31+31+22)")
    checar("Dias YTD conferem", dias_ytd, 265)
    checar("YTD", m["ytd"], 265 * 200.0)

    # --- Passo 5: YTD ano anterior, MESMO corte (01/01/2024..22/09/2024)
    # 2024 é bissexto: 266 dias, um a mais que 2025.
    dias_ytd_ant = (date(2024, 9, 22) - date(2024, 1, 1)).days + 1
    print(f"        Dias YTD-1  = {dias_ytd_ant} (2024 é bissexto: +1 dia)")
    checar("Dias YTD anterior", dias_ytd_ant, 266)
    checar("YTD anterior", m["ytd_anterior"], 266 * 100.0)

    ytd_yoy_manual = (265 * 200.0 - 266 * 100.0) / (266 * 100.0) * 100.0
    print(f"        YTD YoY     = (53.000 - 26.600) / 26.600 = {ytd_yoy_manual:.4f}%")
    checar("YTD YoY %", m["ytd_yoy"], ytd_yoy_manual)


# ---------------------------------------------------------------------------
# 6. Prova de que o método ANTIGO estava errado
# ---------------------------------------------------------------------------

def test_regressao_periodo_parcial():
    print("\n6) REGRESSÃO — mês parcial vs mês fechado (bug corrigido)")
    df = base_ficticia()
    corte = date(2025, 9, 22)
    m = calcular_medidas_tempo(df, corte)

    # Método antigo: mês atual parcial (22 dias) contra agosto FECHADO (31 dias)
    ago_fechado = somar_periodo(df, date(2025, 8, 1), date(2025, 8, 31))
    mom_antigo = divide_seguro(m["mtd"], ago_fechado)
    print(f"        MoM antigo (22d vs 31d) = {mom_antigo:.2f}%  <- falso negativo")
    print(f"        MoM correto (22d vs 22d) = {m['mom']:.2f}%")
    checar("método antigo distorcia", round(mom_antigo, 2), -29.03)
    checar("método corrigido é neutro", m["mom"], 0.0)


# ---------------------------------------------------------------------------
# 7. Base vazia / canal sem histórico
# ---------------------------------------------------------------------------

def test_base_vazia():
    print("\n7) CANAL SEM HISTÓRICO (não pode inventar +100%)")
    df = pd.DataFrame({"DATA": [pd.Timestamp("2025-09-05")], "TOTAL_PREV": [1000.0]})
    m = calcular_medidas_tempo(df, date(2025, 9, 22))
    checar("MTD", m["mtd"], 1000.0)
    checar("MoM sem base -> None", m["mom"], None)
    checar("YoY sem base -> None", m["yoy"], None)
    checar("YTD YoY sem base -> None", m["ytd_yoy"], None)

    vazio = pd.DataFrame(columns=["DATA", "TOTAL_PREV"])
    mv = calcular_medidas_tempo(vazio, date(2025, 9, 22))
    checar("DataFrame vazio -> YTD 0", mv["ytd"], 0.0)
    checar("DataFrame vazio -> MoM None", mv["mom"], None)


# ---------------------------------------------------------------------------
# 8. Tabela de preview exigida pelo protocolo
# ---------------------------------------------------------------------------

def test_tabela_preview():
    print("\n8) TABELA DE AUDITORIA [Mês | Valor_Base | YTD | YoY % | MoM %] — 2025")
    df = base_ficticia()
    tab = tabela_preview(df, 2025)
    print(tab.to_string(index=False))

    # YTD deve ser estritamente acumulativo e fechar o ano em 365 x 200
    ytds = tab["YTD"].tolist()
    checar("YTD é acumulativo", all(ytds[i] < ytds[i + 1] for i in range(len(ytds) - 1)), True)
    checar("YTD dez/2025", ytds[-1], 365 * 200.0)
    # jan/2025 x dez/2024: 31x200 vs 31x100 = +100%
    checar("MoM jan/2025 (vs dez/2024)", tab.iloc[0]["MoM %"], 100.0)
    # fev/2025 (28 dias) x jan/2025 (31 dias) — meses fechados, tamanhos reais
    checar("MoM fev/2025", tab.iloc[1]["MoM %"], round((28 - 31) / 31 * 100, 2))
    # YoY fev/2025 x fev/2024 (bissexto, 29 dias): 28x200 vs 29x100
    checar("YoY fev/2025 (vs fev bissexto)", tab.iloc[1]["YoY %"], round((28 * 200 - 29 * 100) / (29 * 100) * 100, 2))


def main():
    print("=" * 78)
    print(" VALIDAÇÃO DAS MEDIDAS DE INTELIGÊNCIA DE TEMPO — YTD / YoY / MoM")
    print("=" * 78)
    test_divisao_por_zero()
    test_periodos_equivalentes()
    test_bissexto_e_meses_curtos()
    test_data_corte()
    test_calculo_manual()
    test_regressao_periodo_parcial()
    test_base_vazia()
    test_tabela_preview()

    print("\n" + "=" * 78)
    if falhas:
        print(f" RESULTADO: {len(falhas)} FALHA(S) -> {falhas}")
        return 1
    print(" RESULTADO: TODAS AS VERIFICAÇÕES PASSARAM — MEDIDAS ATESTADAS CORRETAS")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
