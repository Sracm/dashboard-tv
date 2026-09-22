"""
Medidas de Inteligência de Tempo (YTD, YoY, MoM) do Painel TV.

Regras de negócio implementadas aqui (equivalentes DAX do Power BI):

  YTD  = SUM(Valor) no intervalo [01/01/AAAA .. Data_Corte]
  YoY% = DIVIDE(Valor_Atual - Valor_Ano_Anterior, Valor_Ano_Anterior)
  MoM% = DIVIDE(Valor_Mes_Atual - Valor_Mes_Anterior, Valor_Mes_Anterior)

Princípio inegociável: TODA comparação usa exatamente o mesmo intervalo de dias.
O mês corrente é sempre parcial (MTD); comparar 22 dias contra um mês fechado de
30/31 dias produz variação falsamente negativa. Por isso o período anterior é
recortado no mesmo dia-do-mês (com clamp para meses curtos e 29/02 bissexto).

O módulo é puro (pandas + datetime, sem Oracle/Flask) para permitir validação
automática — ver tests/test_metricas_tempo.py.
"""

import calendar
from datetime import date

import pandas as pd

# Colunas canônicas esperadas no DataFrame de vendas diárias.
COL_DATA = "DATA"
COL_VALOR = "TOTAL_PREV"


# ----------------------------------------------------------------------------
# Calendário
# ----------------------------------------------------------------------------

def ultimo_dia_do_mes(ano, mes):
    return calendar.monthrange(ano, mes)[1]


def clamp_dia(ano, mes, dia):
    """Ajusta o dia ao último dia válido do mês alvo.

    Sem isso, 31/03 -> fevereiro estoura, e 29/02 de ano bissexto não existe no
    ano anterior. O clamp preserva a comparação "período equivalente".
    """
    return min(dia, ultimo_dia_do_mes(ano, mes))


def data_corte_contexto(mes, ano, hoje=None):
    """Data máxima do contexto para o mês/ano selecionado.

    Mês corrente  -> hoje (período parcial/MTD).
    Mês passado   -> último dia do mês (período fechado).
    Mês futuro    -> último dia do mês (ainda sem dados, soma zero).
    """
    hoje = hoje or date.today()
    if ano == hoje.year and mes == hoje.month:
        return date(ano, mes, hoje.day)
    return date(ano, mes, ultimo_dia_do_mes(ano, mes))


def mes_esta_parcial(corte):
    """True quando o mês do corte ainda está em andamento.

    Distinção decisiva: um mês FECHADO compara-se por inteiro (equivale a
    PREVIOUSMONTH/SAMEPERIODLASTYEAR do DAX); um mês PARCIAL precisa recortar o
    período de comparação no mesmo dia, senão 22 dias disputam com 31.
    """
    return corte.day < ultimo_dia_do_mes(corte.year, corte.month)


def periodo_mes_anterior(corte, parcial=None):
    """Mês imediatamente anterior — recortado no mesmo dia se o atual é parcial."""
    if parcial is None:
        parcial = mes_esta_parcial(corte)
    mes_ant = 12 if corte.month == 1 else corte.month - 1
    ano_ant = corte.year - 1 if corte.month == 1 else corte.year
    dia_fim = clamp_dia(ano_ant, mes_ant, corte.day) if parcial else ultimo_dia_do_mes(ano_ant, mes_ant)
    return date(ano_ant, mes_ant, 1), date(ano_ant, mes_ant, dia_fim)


def periodo_mes_atual(corte):
    return date(corte.year, corte.month, 1), corte


def periodo_ano_anterior_mes(corte, parcial=None):
    """Mesmo mês do ano anterior — recortado no mesmo dia se o atual é parcial."""
    if parcial is None:
        parcial = mes_esta_parcial(corte)
    ano_ant = corte.year - 1
    dia_fim = clamp_dia(ano_ant, corte.month, corte.day) if parcial else ultimo_dia_do_mes(ano_ant, corte.month)
    return date(ano_ant, corte.month, 1), date(ano_ant, corte.month, dia_fim)


def periodo_ytd(corte):
    return date(corte.year, 1, 1), corte


def periodo_ytd_ano_anterior(corte, parcial=None):
    """YTD do ano anterior recortado na data equivalente (01/01 .. mesmo DD/MM).

    Se o mês do corte está fechado, o ano anterior fecha o mesmo mês por
    inteiro — assim fev/2025 (28d) confronta fev/2024 (29d) sem perder um dia.
    """
    if parcial is None:
        parcial = mes_esta_parcial(corte)
    ano_ant = corte.year - 1
    dia_fim = clamp_dia(ano_ant, corte.month, corte.day) if parcial else ultimo_dia_do_mes(ano_ant, corte.month)
    return date(ano_ant, 1, 1), date(ano_ant, corte.month, dia_fim)


# ----------------------------------------------------------------------------
# Agregação e variação
# ----------------------------------------------------------------------------

def divide_seguro(numerador, denominador, alternativo=None):
    """Equivalente ao DIVIDE() do DAX: nunca lança erro de divisão por zero.

    Denominador 0, negativo ou nulo -> `alternativo` (None por padrão, o que a
    UI renderiza como "—"). Jamais inventar 100%: isso mascarava base zero.
    """
    if denominador is None or numerador is None:
        return alternativo
    try:
        den = float(denominador)
        num = float(numerador)
    except (TypeError, ValueError):
        return alternativo
    if den <= 0:
        return alternativo
    return (num - den) / den * 100.0


def somar_periodo(df, inicio, fim, col_data=COL_DATA, col_valor=COL_VALOR):
    """Soma o valor no intervalo fechado [inicio, fim].

    Trabalha sobre a dimensão de datas real das vendas; datas ausentes no
    período simplesmente não somam (equivale a uma dCalendario contínua com
    zeros, sem alterar o resultado da soma).
    """
    if df is None or len(df) == 0 or col_data not in df.columns:
        return 0.0
    datas = pd.to_datetime(df[col_data], errors="coerce")
    mask = (datas >= pd.Timestamp(inicio)) & (datas <= pd.Timestamp(fim))
    if not mask.any():
        return 0.0
    return float(pd.to_numeric(df.loc[mask, col_valor], errors="coerce").fillna(0.0).sum())


def calcular_medidas_tempo(df, corte, col_data=COL_DATA, col_valor=COL_VALOR):
    """Calcula YTD, YoY e MoM para um único conjunto de vendas diárias.

    `df` deve conter TODAS as datas necessárias (ano corrente e ano anterior).
    Retorna também os valores-base de cada período para auditoria/validação.
    """
    parcial = mes_esta_parcial(corte)

    ini_mtd, fim_mtd = periodo_mes_atual(corte)
    ini_mom, fim_mom = periodo_mes_anterior(corte, parcial)
    ini_yoy, fim_yoy = periodo_ano_anterior_mes(corte, parcial)
    ini_ytd, fim_ytd = periodo_ytd(corte)
    ini_ytd_ant, fim_ytd_ant = periodo_ytd_ano_anterior(corte, parcial)

    mtd = somar_periodo(df, ini_mtd, fim_mtd, col_data, col_valor)
    mes_anterior = somar_periodo(df, ini_mom, fim_mom, col_data, col_valor)
    mes_ano_anterior = somar_periodo(df, ini_yoy, fim_yoy, col_data, col_valor)
    ytd = somar_periodo(df, ini_ytd, fim_ytd, col_data, col_valor)
    ytd_anterior = somar_periodo(df, ini_ytd_ant, fim_ytd_ant, col_data, col_valor)

    return {
        "corte": corte.isoformat(),
        "dias_periodo": corte.day,
        "parcial": parcial,
        "mtd": mtd,
        "mes_anterior": mes_anterior,
        "mes_ano_anterior": mes_ano_anterior,
        "ytd": ytd,
        "ytd_anterior": ytd_anterior,
        "mom": divide_seguro(mtd, mes_anterior),
        "yoy": divide_seguro(mtd, mes_ano_anterior),
        "ytd_yoy": divide_seguro(ytd, ytd_anterior),
        "periodos": {
            "mtd": (ini_mtd.isoformat(), fim_mtd.isoformat()),
            "mes_anterior": (ini_mom.isoformat(), fim_mom.isoformat()),
            "mes_ano_anterior": (ini_yoy.isoformat(), fim_yoy.isoformat()),
            "ytd": (ini_ytd.isoformat(), fim_ytd.isoformat()),
            "ytd_anterior": (ini_ytd_ant.isoformat(), fim_ytd_ant.isoformat()),
        },
    }


def tabela_preview(df, ano, col_data=COL_DATA, col_valor=COL_VALOR):
    """Tabela de auditoria [Mês | Valor_Base | YTD | YoY % | MoM %] do ano.

    Cada mês é avaliado fechado (corte = último dia), que é o caso natural de
    conferência contra o Power BI.
    """
    linhas = []
    for mes in range(1, 13):
        corte = date(ano, mes, ultimo_dia_do_mes(ano, mes))
        m = calcular_medidas_tempo(df, corte, col_data, col_valor)
        linhas.append({
            "Mes": f"{mes:02d}/{ano}",
            "Valor_Base": round(m["mtd"], 2),
            "YTD": round(m["ytd"], 2),
            "YoY %": None if m["yoy"] is None else round(m["yoy"], 2),
            "MoM %": None if m["mom"] is None else round(m["mom"], 2),
        })
    return pd.DataFrame(linhas)
