// ==========================================================================
// DIARIO_CANAL.JS - Acompanhamento Diário por Canal (MQ Professional)
// Suporte a Modo TV (2 por tela), Modo Grade (Todos) e Foco Individual
// ==========================================================================

let diarioCharts = {};
let nextUpdateSeconds = 600;

// Estado da Aplicação
let allDataList = [];
let currentVisualMode = 'carousel'; // 'carousel' | 'grid' | 'focus'
let currentMetricType = 'acumulado'; // 'acumulado' | 'diario'
let selectedFocusChannel = null;
let currentCarouselPage = 0;
let isCarouselPaused = false;
let carouselInterval = null;
const CAROUSEL_DURATION_MS = 12000; // 12 segundos por página

// Mapeamento de Ícones por Canal
const CANAL_ICONS = {
    'VAREJO ESPECIALIZADO - SP': '🛍️',
    'VAREJO ESPECIALIZADO REG': '🏬',
    'DISTRIBUIÇÃO': '📦',
    'COMEX': '🚢',
    'ECOMMERCE': '🛒',
    'EMPRESA': '🏢'
};

function pararTodosAudios() {
    const audio = document.getElementById('victory-sound');
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }
}

function navigateTab(path) {
    pararTodosAudios();
    if (path === '/tv' || path === '/') {
        window.location.href = '/tv';
        return;
    }
    const mes = document.getElementById('filter-month').value;
    const ano = document.getElementById('filter-year').value;
    window.location.href = `${path}?mes=${mes}&ano=${ano}`;
}

window.addEventListener('beforeunload', () => pararTodosAudios());
window.addEventListener('pagehide', () => pararTodosAudios());

function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('date');
    if (clockEl) clockEl.innerText = now.toLocaleTimeString('pt-BR');
    if (dateEl) dateEl.innerText = now.toLocaleDateString('pt-BR');

    nextUpdateSeconds--;
    if (nextUpdateSeconds <= 0) {
        nextUpdateSeconds = 600;
        fetchData(true);
    }
    
    const nextUpdateEl = document.getElementById('next-update');
    if (nextUpdateEl) {
        const min = Math.floor(nextUpdateSeconds / 60);
        const sec = nextUpdateSeconds % 60;
        nextUpdateEl.innerText = `Próxima atualização em: ${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
}

function formatMoedaCurta(valor) {
    if (!valor || isNaN(valor)) return 'R$ 0';
    if (valor >= 1000000) {
        return 'R$ ' + (valor / 1000000).toFixed(1) + 'M';
    } else if (valor >= 1000) {
        return 'R$ ' + (valor / 1000).toFixed(0) + 'k';
    }
    return 'R$ ' + valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function formatMoedaCompleta(valor) {
    if (!valor || isNaN(valor)) return 'R$ 0';
    return 'R$ ' + Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Opções ECharts Refinadas
function getDiarioOption(item, isLarge = false) {
    const dias = item.dias || [];
    const isAcumulado = (currentMetricType === 'acumulado');

    const serieAtual = isAcumulado ? item.mes_atual : item.diario_atual;
    const serieAnt = isAcumulado ? item.mes_anterior : item.diario_anterior;
    const serieYoy = isAcumulado ? item.ano_anterior : item.diario_ano_anterior;

    const ultIndex = dias.length - 1;
    const ultValAtual = serieAtual && serieAtual.length > 0 ? serieAtual[ultIndex] : 0;

    return {
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(15, 15, 20, 0.95)',
            borderColor: 'rgba(203, 151, 39, 0.6)',
            borderWidth: 1,
            padding: [10, 14],
            textStyle: { color: '#fff', fontFamily: 'Montserrat, sans-serif' },
            formatter: function(params) {
                if (!params || params.length === 0) return '';
                const diaIdx = params[0].dataIndex;
                const diaNum = dias[diaIdx];

                const vAtualAcum = item.mes_atual ? item.mes_atual[diaIdx] : 0;
                const vAtualDia = item.diario_atual ? item.diario_atual[diaIdx] : 0;
                const vAntAcum = item.mes_anterior ? item.mes_anterior[diaIdx] : 0;
                const vYoyAcum = item.ano_anterior ? item.ano_anterior[diaIdx] : 0;

                let s = `<div style="font-weight: 800; font-size: 13px; color: #CB9727; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 4px;">`;
                s += `📅 Dia ${diaNum}</div>`;

                s += `<div style="display: flex; justify-content: space-between; gap: 15px; margin: 3px 0;">`;
                s += `<span style="color: #FF5252;">● Venda do Dia:</span><strong>${formatMoedaCompleta(vAtualDia)}</strong></div>`;

                s += `<div style="display: flex; justify-content: space-between; gap: 15px; margin: 3px 0;">`;
                s += `<span style="color: #FF2A2A;">● Acumulado Atual:</span><strong>${formatMoedaCompleta(vAtualAcum)}</strong></div>`;

                s += `<div style="display: flex; justify-content: space-between; gap: 15px; margin: 3px 0;">`;
                s += `<span style="color: #FFC107;">● Mês Anterior (Acum):</span><strong>${formatMoedaCompleta(vAntAcum)}</strong></div>`;

                s += `<div style="display: flex; justify-content: space-between; gap: 15px; margin: 3px 0;">`;
                s += `<span style="color: #00B0FF;">● Ano Anterior (Acum):</span><strong>${formatMoedaCompleta(vYoyAcum)}</strong></div>`;

                return s;
            }
        },
        grid: {
            top: isLarge ? 35 : 28,
            bottom: isLarge ? 30 : 24,
            left: isLarge ? 65 : 55,
            right: 25,
            containLabel: false
        },
        xAxis: {
            type: 'category',
            data: dias,
            axisLabel: {
                color: '#aaa',
                fontSize: isLarge ? 11 : 9.5,
                fontFamily: 'Montserrat, sans-serif',
                interval: 0
            },
            axisTick: { alignWithLabel: true, lineStyle: { color: 'rgba(255,255,255,0.15)' } },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            axisLabel: {
                color: '#aaa',
                fontSize: isLarge ? 11 : 9.5,
                fontFamily: 'Montserrat, sans-serif',
                formatter: function(val) {
                    return formatMoedaCurta(val);
                }
            },
            splitLine: {
                lineStyle: { color: 'rgba(255, 255, 255, 0.05)', type: 'dashed' }
            }
        },
        series: [
            // 1. ANO ANTERIOR (Ciano suave tracejado)
            {
                name: 'ANO ANTERIOR',
                type: 'line',
                data: serieYoy,
                smooth: true,
                symbol: 'none',
                lineStyle: { width: isLarge ? 2.5 : 2, color: '#00B0FF', type: 'dashed', opacity: 0.75 },
                itemStyle: { color: '#00B0FF' }
            },
            // 2. MÊS ANTERIOR (Dourado/Âmbar)
            {
                name: 'MÊS ANTERIOR',
                type: 'line',
                data: serieAnt,
                smooth: true,
                symbol: 'circle',
                symbolSize: isLarge ? 5 : 4,
                showSymbol: false,
                lineStyle: { width: isLarge ? 2.8 : 2.2, color: '#FFC107', opacity: 0.9 },
                itemStyle: { color: '#FFC107' }
            },
            // 3. MÊS ATUAL (Vermelho MQ Vibrante com Gradiente de Área e Destaque no Ponto Final)
            {
                name: 'MÊS ATUAL',
                type: isAcumulado ? 'line' : 'bar',
                data: serieAtual,
                smooth: true,
                symbol: 'circle',
                symbolSize: isLarge ? 8 : 6,
                showSymbol: true,
                barMaxWidth: 24,
                itemStyle: { 
                    color: isAcumulado ? '#FF2A2A' : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#FF5252' },
                        { offset: 1, color: '#B71C1C' }
                    ]),
                    borderRadius: isAcumulado ? 0 : [4, 4, 0, 0]
                },
                lineStyle: { 
                    width: isLarge ? 4 : 3.2, 
                    color: '#FF2A2A',
                    shadowColor: 'rgba(255, 42, 42, 0.7)',
                    shadowBlur: 10
                },
                areaStyle: isAcumulado ? {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(255, 42, 42, 0.45)' },
                        { offset: 0.7, color: 'rgba(255, 42, 42, 0.08)' },
                        { offset: 1, color: 'rgba(255, 42, 42, 0.0)' }
                    ])
                } : null,
                markPoint: {
                    symbol: 'pin',
                    symbolSize: isLarge ? 52 : 44,
                    data: [
                        { 
                            coord: [ultIndex, ultValAtual], 
                            value: formatMoedaCurta(ultValAtual),
                            itemStyle: { color: '#FF2A2A', shadowBlur: 10, shadowColor: 'rgba(255,42,42,0.8)' },
                            label: {
                                fontSize: isLarge ? 10.5 : 9,
                                fontWeight: 800,
                                color: '#fff',
                                offset: [0, -2]
                            }
                        }
                    ]
                }
            }
        ]
    };
}

function renderDiarioCards() {
    const container = document.getElementById('diario-container');
    if (!container) return;

    Object.values(diarioCharts).forEach(c => c && c.dispose());
    diarioCharts = {};
    container.innerHTML = '';

    if (!allDataList || allDataList.length === 0) return;

    // Atualiza classes do container conforme modo
    container.className = '';
    if (currentVisualMode === 'carousel') {
        container.classList.add('grid-carousel-diario');
    } else if (currentVisualMode === 'grid') {
        container.classList.add('grid-all-diario');
    } else if (currentVisualMode === 'focus') {
        container.classList.add('grid-focus-diario');
    }

    // 1. MODO FOCO INDIVIDUAL
    if (currentVisualMode === 'focus' && selectedFocusChannel) {
        const item = allDataList.find(d => d.canal === selectedFocusChannel) || allDataList[0];
        renderCardFoco(container, item);
        return;
    }

    // 2. MODO CARROSSEL (2 por tela) ou MODO GRADE (Todos)
    let pageItems = [];
    if (currentVisualMode === 'carousel') {
        const itemsPerPage = 2;
        const totalPages = Math.ceil(allDataList.length / itemsPerPage);
        if (currentCarouselPage >= totalPages) currentCarouselPage = 0;
        const startIndex = currentCarouselPage * itemsPerPage;
        pageItems = allDataList.slice(startIndex, startIndex + itemsPerPage);
        
        // Atualiza indicador de página
        const ind = document.getElementById('carousel-indicator');
        if (ind) ind.innerText = `Pág ${currentCarouselPage + 1} / ${totalPages}`;
    } else {
        // Grade Completa (todos)
        pageItems = allDataList;
    }

    pageItems.forEach((item, idx) => {
        const cardId = `diario-card-${idx}`;
        const chartId = `diario-chart-${idx}`;

        const kpis = item.kpis || {};
        const icon = CANAL_ICONS[item.canal] || '📊';

        const momBadgeClass = kpis.var_mom_pct >= 0 ? 'badge-pos' : 'badge-neg';
        const momSign = kpis.var_mom_pct >= 0 ? '+' : '';
        const yoyBadgeClass = kpis.var_yoy_pct >= 0 ? 'badge-pos' : 'badge-neg';
        const yoySign = kpis.var_yoy_pct >= 0 ? '+' : '';

        const card = document.createElement('div');
        card.className = 'diario-card';
        card.id = cardId;

        card.innerHTML = `
            <div class="diario-card-header">
                <div class="card-header-left">
                    <span class="card-channel-icon">${icon}</span>
                    <div class="card-channel-info">
                        <h3 class="card-channel-name">${item.canal}</h3>
                        <span class="card-channel-sub">Dias 1 a ${kpis.dia_ultimo || item.dias.length}</span>
                    </div>
                </div>

                <div class="card-kpis-ribbon">
                    <div class="kpi-pill kpi-pill-main">
                        <span class="kpi-pill-label">Acumulado Atual</span>
                        <span class="kpi-pill-value">${formatMoedaCompleta(kpis.total_atual)}</span>
                    </div>

                    <div class="kpi-pill kpi-pill-dia">
                        <span class="kpi-pill-label">Venda Dia ${kpis.dia_ultimo}</span>
                        <span class="kpi-pill-value">${formatMoedaCompleta(kpis.venda_ultimo_dia)}</span>
                    </div>

                    <div class="kpi-pill">
                        <span class="kpi-pill-label">vs Mês Ant</span>
                        <span class="kpi-badge ${momBadgeClass}">${momSign}${kpis.var_mom_pct}%</span>
                    </div>

                    <div class="kpi-pill">
                        <span class="kpi-pill-label">vs Ano Ant</span>
                        <span class="kpi-badge ${yoyBadgeClass}">${yoySign}${kpis.var_yoy_pct}%</span>
                    </div>
                </div>
            </div>

            <div class="diario-card-chart-wrapper">
                <div class="diario-card-chart" id="${chartId}"></div>
            </div>
        `;

        container.appendChild(card);

        const chartEl = document.getElementById(chartId);
        if (chartEl) {
            const chart = echarts.init(chartEl);
            const isLarge = (currentVisualMode === 'carousel');
            chart.setOption(getDiarioOption(item, isLarge));
            diarioCharts[idx] = chart;
        }
    });
}

function renderCardFoco(container, item) {
    const kpis = item.kpis || {};
    const icon = CANAL_ICONS[item.canal] || '📊';

    const momBadgeClass = kpis.var_mom_pct >= 0 ? 'badge-pos' : 'badge-neg';
    const momSign = kpis.var_mom_pct >= 0 ? '+' : '';
    const yoyBadgeClass = kpis.var_yoy_pct >= 0 ? 'badge-pos' : 'badge-neg';
    const yoySign = kpis.var_yoy_pct >= 0 ? '+' : '';

    // Coluna 1: Card com Gráfico Amplo
    const cardGrafico = document.createElement('div');
    cardGrafico.className = 'diario-card';
    cardGrafico.innerHTML = `
        <div class="diario-card-header">
            <div class="card-header-left">
                <span class="card-channel-icon" style="font-size: 1.4rem;">${icon}</span>
                <div class="card-channel-info">
                    <h3 class="card-channel-name" style="font-size: 1.15rem;">${item.canal}</h3>
                    <span class="card-channel-sub">Visão Analítica Completa do Mês</span>
                </div>
            </div>

            <div class="card-kpis-ribbon">
                <div class="kpi-pill kpi-pill-main">
                    <span class="kpi-pill-label">Acumulado</span>
                    <span class="kpi-pill-value">${formatMoedaCompleta(kpis.total_atual)}</span>
                </div>
                <div class="kpi-pill kpi-pill-dia">
                    <span class="kpi-pill-label">Último Dia</span>
                    <span class="kpi-pill-value">${formatMoedaCompleta(kpis.venda_ultimo_dia)}</span>
                </div>
                <div class="kpi-pill">
                    <span class="kpi-pill-label">vs Mês Ant</span>
                    <span class="kpi-badge ${momBadgeClass}">${momSign}${kpis.var_mom_pct}%</span>
                </div>
                <div class="kpi-pill">
                    <span class="kpi-pill-label">vs Ano Ant</span>
                    <span class="kpi-badge ${yoyBadgeClass}">${yoySign}${kpis.var_yoy_pct}%</span>
                </div>
            </div>
        </div>

        <div class="diario-card-chart-wrapper">
            <div class="diario-card-chart" id="diario-chart-focus"></div>
        </div>
    `;

    // Coluna 2: Tabela Analítica Dia a Dia
    const cardTabela = document.createElement('div');
    cardTabela.className = 'diario-focus-table-container';

    let linhasHtml = '';
    const dias = item.dias || [];
    for (let i = dias.length - 1; i >= 0; i--) {
        const dia = dias[i];
        const vDia = item.diario_atual ? item.diario_atual[i] : 0;
        const vAcum = item.mes_atual ? item.mes_atual[i] : 0;
        const vAntAcum = item.mes_anterior ? item.mes_anterior[i] : 0;
        const isHoje = (i === dias.length - 1);

        linhasHtml += `
            <tr class="${isHoje ? 'row-hoje' : ''}">
                <td>Dia ${dia}</td>
                <td style="color: #00E676; font-weight: 700;">${formatMoedaCompleta(vDia)}</td>
                <td style="color: #FFD54F;">${formatMoedaCompleta(vAcum)}</td>
                <td style="color: #ccc;">${formatMoedaCompleta(vAntAcum)}</td>
            </tr>
        `;
    }

    cardTabela.innerHTML = `
        <div class="diario-focus-table-header">
            <span>📋 Histórico Diário Detalhado</span>
            <span style="font-size: 0.72rem; color: #888;">Dias 1 a ${kpis.dia_ultimo}</span>
        </div>
        <div class="diario-focus-table-scroll">
            <table class="diario-table">
                <thead>
                    <tr>
                        <th>Dia</th>
                        <th>Venda Dia</th>
                        <th>Acumulado</th>
                        <th>Mês Ant</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhasHtml}
                </tbody>
            </table>
        </div>
    `;

    container.appendChild(cardGrafico);
    container.appendChild(cardTabela);

    const chartEl = document.getElementById('diario-chart-focus');
    if (chartEl) {
        const chart = echarts.init(chartEl);
        chart.setOption(getDiarioOption(item, true));
        diarioCharts['focus'] = chart;
    }
}

function renderChannelPills() {
    const container = document.getElementById('channel-pills');
    if (!container) return;

    container.innerHTML = '';

    const btnTodos = document.createElement('button');
    btnTodos.className = `channel-pill-btn ${selectedFocusChannel === null ? 'active' : ''}`;
    btnTodos.innerText = '✨ Todos os Canais';
    btnTodos.onclick = () => {
        selectedFocusChannel = null;
        if (currentVisualMode === 'focus') currentVisualMode = 'carousel';
        atualizarBotoesModo();
        renderChannelPills();
        renderDiarioCards();
        if (currentVisualMode === 'carousel') startCarousel();
    };
    container.appendChild(btnTodos);

    allDataList.forEach(item => {
        const btn = document.createElement('button');
        const isActive = (selectedFocusChannel === item.canal);
        btn.className = `channel-pill-btn ${isActive ? 'active' : ''}`;
        const icon = CANAL_ICONS[item.canal] || '';
        btn.innerText = `${icon} ${item.canal}`;
        btn.onclick = () => {
            selectedFocusChannel = item.canal;
            currentVisualMode = 'focus';
            atualizarBotoesModo();
            renderChannelPills();
            renderDiarioCards();
            if (carouselInterval) clearInterval(carouselInterval);
        };
        container.appendChild(btn);
    });
}

function setVisualMode(mode) {
    currentVisualMode = mode;
    selectedFocusChannel = null;
    atualizarBotoesModo();
    renderChannelPills();
    renderDiarioCards();

    if (mode === 'carousel') {
        startCarousel();
    } else {
        if (carouselInterval) clearInterval(carouselInterval);
    }
}

function setMetricType(metric) {
    currentMetricType = metric;
    
    const btnAcum = document.getElementById('btn-metric-acum');
    const btnDiario = document.getElementById('btn-metric-diario');
    if (btnAcum) btnAcum.classList.toggle('active', metric === 'acumulado');
    if (btnDiario) btnDiario.classList.toggle('active', metric === 'diario');

    renderDiarioCards();
}

function atualizarBotoesModo() {
    const btnCarousel = document.getElementById('btn-mode-carousel');
    const btnGrid = document.getElementById('btn-mode-grid');
    const navControls = document.getElementById('carousel-nav-controls');

    if (btnCarousel) btnCarousel.classList.toggle('active', currentVisualMode === 'carousel');
    if (btnGrid) btnGrid.classList.toggle('active', currentVisualMode === 'grid');

    if (navControls) {
        navControls.style.display = (currentVisualMode === 'carousel') ? 'flex' : 'none';
    }
}

function startCarousel() {
    if (carouselInterval) clearInterval(carouselInterval);
    if (isCarouselPaused) return;
    
    carouselInterval = setInterval(() => {
        if (!allDataList || allDataList.length === 0 || currentVisualMode !== 'carousel') return;
        
        const totalPages = Math.ceil(allDataList.length / 2);
        currentCarouselPage = (currentCarouselPage + 1) % totalPages;
        
        renderDiarioCards();
    }, CAROUSEL_DURATION_MS);
}

function prevCarouselPage() {
    const totalPages = Math.ceil(allDataList.length / 2);
    currentCarouselPage = (currentCarouselPage - 1 + totalPages) % totalPages;
    renderDiarioCards();
}

function nextCarouselPage() {
    const totalPages = Math.ceil(allDataList.length / 2);
    currentCarouselPage = (currentCarouselPage + 1) % totalPages;
    renderDiarioCards();
}

function toggleCarouselPause() {
    isCarouselPaused = !isCarouselPaused;
    const btn = document.getElementById('btn-carousel-pause');
    if (btn) btn.innerText = isCarouselPaused ? '▶' : '⏸';
    if (isCarouselPaused) {
        if (carouselInterval) clearInterval(carouselInterval);
    } else {
        startCarousel();
    }
}

async function fetchData(forceRefresh = false) {
    const mes = document.getElementById('filter-month').value;
    const ano = document.getElementById('filter-year').value;
    
    const container = document.getElementById('diario-container');
    if (container) {
        container.innerHTML = '<div style="text-align:center; padding: 60px; color: #cb9727; width: 100%; font-size: 1.25rem; grid-column: 1 / -1; font-weight: 700;">⏳ Sincronizando Vendas Diárias do Sankhya... Aguarde um instante.</div>';
    }
    
    try {
        let url = `/api/diario_canal?mes=${mes}&ano=${ano}`;
        if (forceRefresh) {
            url += `&refresh=1&_t=${Date.now()}`;
        }
        const response = await fetch(url);
        const json = await response.json();
        
        if (json.success && json.data) {
            allDataList = json.data;
            currentCarouselPage = 0;
            atualizarBotoesModo();
            renderChannelPills();
            renderDiarioCards();
            
            if (currentVisualMode === 'carousel') {
                startCarousel();
            }

            const lastUpdateEl = document.getElementById('last-update');
            if (lastUpdateEl) {
                lastUpdateEl.innerText = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
            }
        } else {
            if (container) container.innerHTML = '<div style="text-align:center; padding: 60px; color: #ff3333; width: 100%; font-size: 1.2rem; grid-column: 1 / -1;">❌ Falha ao carregar dados diários.</div>';
        }
    } catch (e) {
        console.error("Erro ao carregar dados diários dos canais:", e);
        if (container) container.innerHTML = '<div style="text-align:center; padding: 60px; color: #ff3333; width: 100%; font-size: 1.2rem; grid-column: 1 / -1;">❌ Erro de comunicação com o servidor.</div>';
    }
}

function manualRefresh() {
    nextUpdateSeconds = 600;
    fetchData(true);
}

document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const params = new URLSearchParams(window.location.search);
    const mesParam = params.get('mes');
    const anoParam = params.get('ano');

    const monthEl = document.getElementById('filter-month');
    const yearEl = document.getElementById('filter-year');

    if (mesParam) {
        let finalMes = mesParam;
        if (mesParam.includes(',')) {
            const parts = mesParam.split(',');
            finalMes = parts[parts.length - 1].trim();
        }
        if (monthEl) monthEl.value = finalMes;
    } else if (monthEl && !monthEl.value) {
        monthEl.value = currentMonth;
    }

    if (anoParam) {
        if (yearEl) yearEl.value = anoParam;
    } else if (yearEl && !yearEl.value) {
        yearEl.value = currentYear;
    }

    fetchData();

    setInterval(updateClock, 1000);
    updateClock();

    window.addEventListener('resize', () => {
        Object.values(diarioCharts).forEach(c => c && c.resize());
    });
});
