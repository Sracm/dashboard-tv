"""
Validação ponta a ponta das medidas por CANAL (camada do app), sem Oracle.

Injeta uma base de vendas diárias fictícia no lugar da consulta ao banco e
confere, canal a canal, se YTD/YoY/MoM batem com o cálculo manual — incluindo
a regra de que E-COMMERCE exclui PARLUX e EMPRESA soma tudo.

    python tests/test_medidas_canais.py
"""

import os
import sys
from datetime import date, timedelta

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app  # noqa: E402

# --- Base fictícia -----------------------------------------------------------
# 4 vendedores, um por setor, + a loja PARLUX dentro de E-COMMERCE.
SETORES = pd.DataFrame([
    {"CODVEND": 1, "SETOR": "SP", "VENDEDOR": "VEND SP"},
    {"CODVEND": 2, "SETOR": "SUL", "VENDEDOR": "VEND SUL"},
    {"CODVEND": 3, "SETOR": "DISTRIBUIÇÃO", "VENDEDOR": "VEND DIST"},
    {"CODVEND": 4, "SETOR": "COMEX", "VENDEDOR": "VEND COMEX"},
    {"CODVEND": 5, "SETOR": "E-COMMERCE", "VENDEDOR": "LOJA VTEX MQ"},
    {"CODVEND": 6, "SETOR": "E-COMMERCE", "VENDEDOR": "LOJA VTEX PARLUX"},
])

# Valor diário fixo por (vendedor, marca) para tornar tudo conferível na mão.
VALOR_DIA_POR_ANO = {2024: 10.0, 2025: 20.0}
LINHAS_DIA = [
    (1, "MQ"), (2, "MQ"), (3, "MQ"), (4, "MQ"), (5, "MQ"), (6, "PARLUX"),
]


def base_diaria(ano):
    linhas = []
    d = date(ano, 1, 1)
    while d <= date(ano, 12, 31):
        for codvend, marca in LINHAS_DIA:
            linhas.append({
                "DATA": pd.Timestamp(d),
                "MES": d.month,
                "CODVEND": codvend,
                "MARCA": marca,
                "TOTAL_VENDAS": 1,
                "TOTAL_FAT": VALOR_DIA_POR_ANO[ano],
                "TOTAL_PREV": VALOR_DIA_POR_ANO[ano],
            })
        d += timedelta(days=1)
    return pd.DataFrame(linhas)


BASES = {2024: base_diaria(2024), 2025: base_diaria(2025)}

app.obter_vendas_diarias = lambda ano, force_refresh=False: BASES.get(
    ano, pd.DataFrame(columns=["DATA", "MES", "CODVEND", "MARCA", "TOTAL_PREV"])
)
app.carregar_metas_e_setores = lambda mes, ano: (pd.DataFrame(columns=["SETOR", "VENDEDOR", "META"]), SETORES)

falhas = []


def checar(nome, obtido, esperado, tol=1e-6):
    if obtido is None or esperado is None:
        ok = obtido is None and esperado is None
    elif isinstance(obtido, (int, float)) and isinstance(esperado, (int, float)) and not isinstance(obtido, bool):
        ok = abs(obtido - esperado) <= tol
    else:
        ok = obtido == esperado
    print(f"  [{'OK  ' if ok else 'FALHA'}] {nome}: obtido={obtido!r} esperado={esperado!r}")
    if not ok:
        falhas.append(nome)


def test_segmentacao_canais():
    print("\n1) SEGMENTAÇÃO DE CANAIS (um dia de 2025, R$ 20 por linha)")
    dia = BASES[2025][BASES[2025]["DATA"] == pd.Timestamp("2025-09-10")]
    r = app.calcular_realizado_por_canal(dia, SETORES)
    checar("SP", r["VAREJO ESPECIALIZADO - SP"], 20.0)
    checar("REG (SUL)", r["VAREJO ESPECIALIZADO REG."], 20.0)
    checar("DISTRIBUIÇÃO", r["DISTRIBUIÇÃO"], 20.0)
    checar("COMEX", r["COMEX"], 20.0)
    checar("E-COMMERCE exclui PARLUX", r["E-COMMERCE"], 20.0)
    checar("E-COMMERCE - PARLUX", r["E-COMMERCE - PARLUX"], 20.0)
    checar("EMPRESA = soma de todos (6 linhas)", r["EMPRESA"], 120.0)


def test_medidas_mes_parcial():
    print("\n2) MÊS PARCIAL — contexto 22/09/2025")
    medidas, ctx = app.calcular_medidas_tempo_canais(9, 2025, hoje=date(2025, 9, 22))
    print(f"        corte={ctx['corte']} parcial={ctx['parcial']} dias={ctx['dias']}")
    print(f"        MTD          = {ctx['periodos']['mtd']}")
    print(f"        mês anterior = {ctx['periodos']['mes_anterior']}")
    print(f"        ano anterior = {ctx['periodos']['mes_ano_anterior']}")
    print(f"        YTD          = {ctx['periodos']['ytd']}")
    print(f"        YTD anterior = {ctx['periodos']['ytd_anterior']}")

    checar("é parcial", ctx["parcial"], True)
    checar("dias do período", ctx["dias"], 22)

    sp = medidas["VAREJO ESPECIALIZADO - SP"]
    # Passo a passo: SP tem 1 linha/dia a R$ 20 em 2025 e R$ 10 em 2024.
    print(f"        SP: MTD manual = 22 x 20 = {22 * 20}")
    checar("SP MTD", sp["mtd"], 440.0)
    checar("SP mês anterior (01-22/08)", sp["mes_anterior"], 440.0)
    checar("SP MoM = 0%", sp["mom"], 0.0)
    print(f"        SP: base YoY manual = 22 x 10 = {22 * 10}")
    checar("SP mês ano anterior (01-22/09/2024)", sp["mes_ano_anterior"], 220.0)
    checar("SP YoY = +100%", sp["yoy"], 100.0)
    print("        SP: YTD manual = 265 dias x 20 = 5300 | YTD-1 = 266 x 10 = 2660")
    checar("SP YTD", sp["ytd"], 5300.0)
    checar("SP YTD anterior (2024 bissexto, 266 dias)", sp["ytd_anterior"], 2660.0)
    checar("SP YTD YoY", sp["ytd_yoy"], (5300 - 2660) / 2660 * 100)

    emp = medidas["EMPRESA"]
    checar("EMPRESA MTD = 6 x 440", emp["mtd"], 2640.0)
    checar("EMPRESA YoY = +100%", emp["yoy"], 100.0)


def test_medidas_mes_fechado():
    print("\n3) MÊS FECHADO — contexto agosto/2025 (visto de 22/09/2025)")
    medidas, ctx = app.calcular_medidas_tempo_canais(8, 2025, hoje=date(2025, 9, 22))
    print(f"        corte={ctx['corte']} parcial={ctx['parcial']}")
    checar("não é parcial", ctx["parcial"], False)
    checar("compara com julho INTEIRO", ctx["periodos"]["mes_anterior"][1], "2025-07-31")

    sp = medidas["VAREJO ESPECIALIZADO - SP"]
    # ago = 31 dias x 20 = 620 ; jul = 31 x 20 = 620 -> MoM 0%
    checar("SP MTD ago", sp["mtd"], 620.0)
    checar("SP MoM ago vs jul", sp["mom"], 0.0)
    checar("SP YoY ago/2024 (31 x 10)", sp["mes_ano_anterior"], 310.0)
    checar("SP YoY", sp["yoy"], 100.0)


def test_janeiro_cruza_o_ano():
    print("\n4) JANEIRO — MoM deve buscar dezembro do ANO ANTERIOR")
    medidas, ctx = app.calcular_medidas_tempo_canais(1, 2025, hoje=date(2025, 1, 15))
    print(f"        mês anterior = {ctx['periodos']['mes_anterior']}")
    checar("aponta para dez/2024", ctx["periodos"]["mes_anterior"][0], "2024-12-01")
    sp = medidas["VAREJO ESPECIALIZADO - SP"]
    # jan/2025: 15 x 20 = 300 ; dez/2024 recortado em 15 dias: 15 x 10 = 150
    checar("SP MTD jan", sp["mtd"], 300.0)
    checar("SP base dez/2024 (15 dias)", sp["mes_anterior"], 150.0)
    checar("SP MoM = +100%", sp["mom"], 100.0)


def test_sem_historico():
    print("\n5) ANO SEM HISTÓRICO — não pode inventar percentual")
    medidas, _ = app.calcular_medidas_tempo_canais(3, 2024, hoje=date(2024, 3, 10))
    sp = medidas["VAREJO ESPECIALIZADO - SP"]
    checar("MTD mar/2024", sp["mtd"], 100.0)  # 10 dias x 10
    checar("YoY sem 2023 -> None", sp["yoy"], None)
    checar("YTD YoY sem 2023 -> None", sp["ytd_yoy"], None)


def main():
    print("=" * 78)
    print(" VALIDAÇÃO DAS MEDIDAS POR CANAL — TABELA DOS VELOCÍMETROS")
    print("=" * 78)
    test_segmentacao_canais()
    test_medidas_mes_parcial()
    test_medidas_mes_fechado()
    test_janeiro_cruza_o_ano()
    test_sem_historico()

    print("\n" + "=" * 78)
    if falhas:
        print(f" RESULTADO: {len(falhas)} FALHA(S) -> {falhas}")
        return 1
    print(" RESULTADO: TODOS OS CANAIS ATESTADOS CORRETOS")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
