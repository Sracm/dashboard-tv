# Atualização e Implementações Dashboard TV (MQ Hair)

## Resumo das Entregas e Ajustes Realizados

### 1. Alternador Automático de Telas (Carrossel Contínuo para TV)
- **Tempo de Rotação:** 2.5 minutos (150 segundos) por tela.
- **Abrangência:** Todas as 18 guias do Dashboard na ordem da barra superior:
  1. `/tv` - Mensal (%)
  2. `/acumulado` - Acumulado (%)
  3. `/trimestre` - Trimestre
  4. `/todos_canais` - Todos os Canais
  5. `/categorias` - Categorias
  6. `/marcas` - Marcas
  7. `/canal/distribuicao` - Distribuição
  8. `/canal/ecommerce_mq` - E-commerce MQ
  9. `/canal/varejo_sp` - Varejo SP
  10. `/canal/comex` - Comex
  11. `/canal/regional_no_nd` - Regional NO/ND
  12. `/canal/regional_rj_mg_es` - Reg. RJ/MG/ES
  13. `/canal/regional_sul` - Regional Sul
  14. `/empresa` - Empresa
  15. `/diario_canal` - Diário Canal
  16. `/diario_marcas` - Diário Marcas
  17. `/paises` - Países
  18. `/teste_estoque` - Estoque e Previsão
- **Controle Visual:** Pill interativo no topo exibindo `Auto-TV: MM:SS`, `Dados: MM:SS`, botão de pausa/play e suporte a tecla de espaço para pausar.
- **Regra de Travamento:** A guia Mensal (%) permanece sempre travada no **mês atual corrente**.

---

### 2. Atualização Automática de Dados a Cada 10 Minutos
- **Intervalo:** 600 segundos (10 minutos).
- **Persistência Compartilhada:** Armazenado via `localStorage` (`tv_proxima_atualizacao_dados_ts`), garantindo que a contagem não resete ao trocar de guias a cada 2.5 minutos.
- **Forçar Dados do Banco:** Dispara requisições com parâmetro `refresh=1` para garantir atualização direta sem cache antigo.

---

### 3. Monitoramento de Oscilação de Percentuais e Alertas de TV
- **Detecção:** A cada 10 minutos, o rotator monitora os canais no mês atual corrente comparando com o estado anterior salvo.
- **Retorno Obrigatório para a Guia Mensal (%):**
  - Caso haja oscilação para cima ou para baixo, e o dashboard estiver em qualquer outra guia, o sistema redireciona imediatamente para a tela `Mensal (%)`.
- **Alerta de Subida no Percentual (💵 Alta):**
  - Card do canal afetado pisca em **verde neon contínuo** (`@keyframes cashGlowGreen`) por 12 segundos.
  - Exibe badge flutuante: `💵 SUBIDA NO PERCENTUAL`.
  - Toca o som da **Caixa Registradora** (`static/audio/caixa_registradora.mp3`).
- **Alerta de Redução no Percentual (🚨 Queda):**
  - Card do canal afetado pisca em **vermelho giroflex** (`@keyframes policeBeaconRed`) por 12 segundos.
  - Exibe badge flutuante: `🚨 QUEDA NO PERCENTUAL`.
  - Toca o som da **Sirene de Polícia / Bombeiro** (`static/audio/sirene_policia.mp3`).

---

### 4. Correção dos Trimestres na Guia "Todos os Canais"
- **Causa Raiz:** A API `/api/canais_trimestre_tv` retornava os canais agrupados de forma que o frontend recebia dados incompletos para os cards, deixando os badges com `—`.
- **Solução Implementada:**
  - Endpoint `/api/canais_trimestre_tv` normalizado retornando agrupamentos `T1`, `T2`, `T3`, `T4` e `by_canal`.
  - Restaurados os 5 sub-botões de navegação no topo (`MÊS SELECIONADO`, `1º TRI`, `2º TRI`, `3º TRI`, `4º TRI`).
  - Adicionada função de correspondência resiliente (`matchCanal`) que diferencia perfeitamente *Varejo SP* de *Varejo Regional*, *Distribuição*, *E-commerce MQ* e *Parlux*.
  - Badges `T1..T4` no rodapé de cada card agora exibem os percentuais calculados e funcionam como atalhos clicáveis para abrir o trimestre diretamente.

---

### 5. Remoção de Exibição de Valores em R$
- **Guia Empresa (Mês Atual e Acumulado Período):** Removidos os comparativos e badges em reais. Exibe exclusivamente percentuais e indicadores relativos (`MoM` e `YoY`).
- **Guia Mensal (%):** O painel e velocímetros focam exclusivamente nas metas percentuais e indicadores de variação relativa.

---

### 6. Sistema de Áudios de Metas
- Músicas de celebração sequenciais por canal:
  - **Empresa:** Van Halen - *Jump* (28s)
  - **Distribuição:** The Who - *Who Are You* (30s)
  - **E-commerce MQ:** Deep Purple - *Perfect Strangers* (30s)
  - **Comex:** Led Zeppelin - *Whole Lotta Love* (30s)
  - **Varejo SP:** Creedence - *Fortunate Son* (18s)
  - **Varejo Reg.:** ZZ Top - *La Grange* (12s)
  - **Parlux:** Heart - *Barracuda* (28s)
- Fila com espaçamento de segurança, controle de toque único por dia/período e banner de desbloqueio para políticas de autoplay na TV.
