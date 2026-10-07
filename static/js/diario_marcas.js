// diario_marcas.js — Acompanhamento Diário por Marcas
let marcasCharts = {};
let nextUpdateSeconds = 600;

// Variáveis do Carrossel
let allDataList = [];
let currentCarouselPage = 0;
let carouselInterval = null;
const CAROUSEL_DURATION_MS = 10000; // 10 segundos por página

function pararTodosAudios() {
    const audio = document.getElementById('music-sound') || document.getElementById('victory-sound');
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

function formatMoeda(valor) {
    if (valor >= 1000000) {
        return (valor / 1000000).toFixed(1) + 'M';
    } else if (valor >= 1000) {
        return (valor / 1000).toFixed(0) + 'k';
    }
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function getDiarioLineOption(dias, mesAtual, mesAnt, anoAnt) {
    return {
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(20, 20, 20, 0.9)',
            borderColor: 'rgba(203, 151, 39, 0.4)',
            textStyle: { color: '#fff', fontSize: 11 },
            formatter: function(params) {
                let s = `<strong>Dia ${params[0].name}</strong><br/>`;
                params.forEach(p => {
                    const vStr = p.value ? 'R$ ' + Number(p.value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : 'R$ 0';
                    s += `<span style="color:${p.color}">●</span> ${p.seriesName}: <strong>${vStr}</strong><br/>`;
                });
                return s;
            }
        },
        grid: {
            top: 22,
            bottom: 22,
            left: 55,
            right: 15
        },
        xAxis: {
            type: 'category',
            data: dias,
            axisLabel: {
                color: '#aaa',
                fontSize: 10,
                interval: 0,
                hideOverlap: false
            },
            axisTick: { alignWithLabel: true },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            axisLabel: {
                color: '#aaa',
                fontSize: 10,
                formatter: function(val) {
                    return formatMoeda(val);
                }
            },
            splitLine: {
                lineStyle: { color: 'rgba(255, 255, 255, 0.08)' }
            }
        },
        series: [
            {
                name: 'ANO ANTERIOR',
                type: 'line',
                data: anoAnt,
                smooth: true,
                symbol: 'circle',
                symbolSize: 4,
                showSymbol: true,
                label: {
                    show: true,
                    position: 'top',
                    color: '#00A3FF',
                    fontSize: 10,
                    formatter: function(p) {
                        return p.value ? Number(p.value).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '';
                    }
                },
                itemStyle: { color: '#00A3FF' },
                lineStyle: { width: 2, color: '#00A3FF', type: 'dashed', opacity: 0.6 }
            },
            {
                name: 'MES ANTERIOR',
                type: 'line',
                data: mesAnt,
                smooth: true,
                symbol: 'circle',
                symbolSize: 5,
                showSymbol: true,
                label: {
                    show: true,
                    position: 'top',
                    color: '#FFC107',
                    fontSize: 10,
                    formatter: function(p) {
                        return p.value ? Number(p.value).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '';
                    }
                },
                itemStyle: { color: '#FFC107' },
                lineStyle: { width: 2.5, color: '#FFC107', opacity: 0.9 }
            },
            {
                name: 'MES ATUAL',
                type: 'line',
                data: mesAtual,
                smooth: true,
                symbol: 'circle',
                symbolSize: 7,
                showSymbol: true,
                label: {
                    show: true,
                    position: 'top',
                    color: '#fff',
                    fontSize: 10,
                    formatter: function(p) {
                        return p.value ? Number(p.value).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '';
                    }
                },
                itemStyle: { color: '#FF3333' },
                lineStyle: { 
                    width: 4, 
                    color: '#FF3333',
                    shadowColor: 'rgba(255, 51, 51, 0.8)',
                    shadowBlur: 10
                },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(255, 51, 51, 0.6)' },
                        { offset: 1, color: 'rgba(255, 51, 51, 0.0)' }
                    ])
                }
            }
        ]
    };
}

function renderMarcasCards() {
    const container = document.getElementById('marcas-container');
    if (!container) return;

    Object.values(marcasCharts).forEach(c => c && c.dispose());
    marcasCharts = {};
    container.innerHTML = '';

    if (!allDataList || allDataList.length === 0) return;

    const itemsPerPage = 2;
    const startIndex = currentCarouselPage * itemsPerPage;
    const pageItems = allDataList.slice(startIndex, startIndex + itemsPerPage);

    pageItems.forEach((item, idx) => {
        const realIdx = startIndex + idx;
        const card = document.createElement('div');
        card.className = 'diario-card';
        card.id = `marca-card-${realIdx}`;

        card.innerHTML = `
            <div class="diario-card-title">${item.marca}</div>
            <div class="diario-card-chart" id="marca-chart-${realIdx}"></div>
        `;
        container.appendChild(card);

        const chartEl = document.getElementById(`marca-chart-${realIdx}`);
        if (chartEl) {
            const chart = echarts.init(chartEl);
            chart.setOption(getDiarioLineOption(item.dias, item.mes_atual, item.mes_anterior, item.ano_anterior));
            marcasCharts[realIdx] = chart;
        }
    });
}

function startCarousel() {
    if (carouselInterval) clearInterval(carouselInterval);
    
    carouselInterval = setInterval(() => {
        if (!allDataList || allDataList.length === 0) return;
        
        const totalPages = Math.ceil(allDataList.length / 2);
        currentCarouselPage = (currentCarouselPage + 1) % totalPages;
        
        renderMarcasCards();
    }, CAROUSEL_DURATION_MS);
}

async function fetchData(forceRefresh = false) {
    const mes = document.getElementById('filter-month').value;
    const ano = document.getElementById('filter-year').value;
    
    try {
        let url = `/api/diario_marcas?mes=${mes}&ano=${ano}`;
        if (forceRefresh) {
            url += `&refresh=1&_t=${Date.now()}`;
        }
        const response = await fetch(url);
        const json = await response.json();
        
        if (json.success && json.data) {
            allDataList = json.data;
            currentCarouselPage = 0;
            renderMarcasCards();
            startCarousel();

            const lastUpdateEl = document.getElementById('last-update');
            if (lastUpdateEl) {
                lastUpdateEl.innerText = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
            }
        }
    } catch (e) {
        console.error("Erro ao carregar dados diários das marcas:", e);
    }
}

function manualRefresh() {
    nextUpdateSeconds = 600;
    fetchData(true);
}

function testarAudio() {
    const audio = document.getElementById('music-sound') || document.getElementById('victory-sound');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.warn("Erro ao tocar áudio:", e));
    }
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
        Object.values(marcasCharts).forEach(c => c && c.resize());
    });
});
