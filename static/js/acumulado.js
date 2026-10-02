// ============================================================
// acumulado.js — Aba ACUMULADO (%)
// Estrutura HTML já fixa no template. JS apenas inicializa
// os gráficos ECharts e preenche com dados da API.
// ============================================================

const MONTH_NAMES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const NUM_EQUIPES = 7;

let barCharts = [];
let gaugeCharts = [];

// ── Opções do gráfico de barras ──────────────────────────────
function getBarOption(history) {
    return {
        grid: { top: 25, bottom: 22, left: 38, right: 12 },
        xAxis: {
            type: 'category',
            data: history.map(h => MONTH_NAMES[h.mes - 1]),
            axisLabel: { color: '#ccc', fontSize: 9.5 }
        },
        yAxis: {
            type: 'value',
            axisLabel: { formatter: '{value}%', color: '#ccc', fontSize: 9.5 },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
        },
        series: [
            {
                data: history.map(h => h.percentual.toFixed(1)),
                type: 'bar',
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#2d7df8' },
                        { offset: 1, color: '#1049b0' }
                    ]),
                    borderRadius: [3, 3, 0, 0]
                },
                emphasis: {
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#4f94ff' },
                            { offset: 1, color: '#1a5bd8' }
                        ])
                    }
                },
                label: {
                    show: true,
                    position: 'top',
                    formatter: '{c}%',
                    color: '#fff',
                    fontSize: 8,
                    fontWeight: 'bold',
                    rotate: 0,
                    offset: [0, -2]
                }
            },
            {
                type: 'line',
                data: history.map(() => 100),
                itemStyle: { color: '#FF1A1A' },
                lineStyle: { color: '#FF1A1A', width: 2 },
                symbol: 'none', silent: true
            }
        ]
    };
}

// ── Opções do mini-velocímetro (igual à guia Mensal) ─────────
function getGaugeOption(percent) {
    const isSuccess = percent >= 100;
    const diff = percent - 100;
    const sign = diff >= 0 ? '+' : '';
    const diffStr = sign + diff.toFixed(1) + '%';
    const diffColor = isSuccess ? '#00d26a' : '#ff2424';

    return {
        series: [
            {
                type: 'gauge',
                startAngle: 180,
                endAngle: 0,
                min: 0,
                max: 120,
                splitNumber: 12,
                radius: '92%',
                center: ['50%', '68%'],
                axisLine: {
                    lineStyle: {
                        width: 12,
                        color: [
                            [80 / 120, '#ff2424'],
                            [100 / 120, '#ffd600'],
                            [1, '#00d26a']
                        ]
                    }
                },
                pointer: {
                    icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
                    length: '58%',
                    width: 5,
                    offsetCenter: [0, '-4%'],
                    itemStyle: { 
                        color: '#f5c518',
                        shadowColor: 'rgba(0,0,0,0.6)',
                        shadowBlur: 3
                    }
                },
                axisTick: {
                    length: 5,
                    lineStyle: { color: 'auto', width: 1 }
                },
                splitLine: {
                    length: 8,
                    lineStyle: { color: 'auto', width: 1.5 }
                },
                axisLabel: {
                    show: false
                },
                title: {
                    offsetCenter: [0, '22%'],
                    fontSize: 15,
                    color: '#0d6efd',
                    fontWeight: 'bolder'
                },
                detail: {
                    fontSize: 11,
                    offsetCenter: [0, '52%'],
                    valueAnimation: true,
                    formatter: function () {
                        return diffStr;
                    },
                    color: diffColor,
                    fontWeight: 'bold'
                },
                data: [{ value: Math.min(Math.max(percent, 0), 120), name: percent === 0 ? '0.0%' : percent.toFixed(1) + '%' }]
            }
        ]
    };
}

// ── Inicializar todos os gráficos (uma única vez) ────────────
function initCharts() {
    for (let i = 0; i < NUM_EQUIPES; i++) {
        const barEl   = document.getElementById(`bar-${i}`);
        const gaugeEl = document.getElementById(`gauge-${i}`);

        barCharts[i]   = echarts.init(barEl);
        gaugeCharts[i] = echarts.init(gaugeEl);
    }
}

// ── Preencher gráficos com dados da API ──────────────────────
function renderData(data, mes, ano) {
    data.forEach((equipe, i) => {
        if (i >= NUM_EQUIPES) return;

        // Atualizar título da barra (caso mude)
        const titleEl = document.getElementById(`bar-title-${i}`);
        if (titleEl) titleEl.textContent = equipe.name;

        // Barras
        barCharts[i].setOption(getBarOption(equipe.history));

        // Velocímetro
        gaugeCharts[i].setOption(getGaugeOption(equipe.percent_ytd));
    });
}

// ── Buscar dados ─────────────────────────────────────────────
async function fetchData(forceRefresh = false) {
    try {
        const now = new Date();
        const yearSelect = document.getElementById('filter-year');
        const year  = yearSelect ? yearSelect.value : now.getFullYear();
        const month = (parseInt(year) === now.getFullYear()) ? (now.getMonth() + 1) : 12;

        let url = `/api/acumulado_tv?mes=${month}&ano=${year}`;
        if (forceRefresh) {
            url += `&refresh=1&_t=${Date.now()}`;
        }
        const res  = await fetch(url);
        const json = await res.json();

        if (json.success) {
            renderData(json.data, month, year);

            const timeNow = new Date();
            document.getElementById('last-update').textContent =
                `Última atualização: ${timeNow.toLocaleTimeString('pt-BR')}`;

            const next = new Date(timeNow.getTime() + 10 * 60000);
            document.getElementById('next-update').textContent =
                `Próxima atualização em: ${next.toLocaleTimeString('pt-BR').substring(0,5)}`;
        }
    } catch (err) {
        console.error('Erro ao buscar dados:', err);
    }
}

// ── Relógio ──────────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('pt-BR');
    document.getElementById('date').textContent  = now.toLocaleDateString('pt-BR');
}

// ── Navegação entre guias (imediata) ─────────────────────────
function navigateTab(path) {
    if (path === '/tv' || path === '/') {
        window.location.href = '/tv';
        return;
    }
    const now = new Date();
    const y = document.getElementById('filter-year')?.value || now.getFullYear();
    const m = (parseInt(y) === now.getFullYear()) ? (now.getMonth() + 1) : 12;
    window.location.href = `${path}?mes=${m}&ano=${y}`;
}

async function manualRefresh() {
    const btn = document.getElementById('btn-refresh');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Atualizando...';
    }
    await fetchData(true);
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '🔄 Atualizar';
    }
}

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    const yearSelect = document.getElementById('filter-year');

    // Na guia Acumulado, SEMPRE deixar setado o ano atual
    if (yearSelect) {
        yearSelect.value = now.getFullYear();
    }

    // Relógio
    updateClock();
    setInterval(updateClock, 1000);

    // Inicializar gráficos (elementos já existem no HTML)
    initCharts();

    // Buscar dados
    fetchData();
    setInterval(() => fetchData(true), 10 * 60 * 1000);
});

// ── Resize ───────────────────────────────────────────────────
window.addEventListener('resize', () => {
    barCharts.forEach(c   => { if (c) c.resize(); });
    gaugeCharts.forEach(c => { if (c) c.resize(); });
});

// ── Filtragem Rápida de Grupos Acumulados ───────────────────
function filtrarAcumulado(tipo) {
    document.querySelectorAll('.sub-nav-canais .tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`btn-acum-${tipo}`);
    if (btn) btn.classList.add('active');

    // 0: SP, 1: REG, 2: DIST, 3: COMEX, 4: ECOM, 5: PARLUX, 6: EMPRESA
    for (let i = 0; i < NUM_EQUIPES; i++) {
        const barCard = document.getElementById(`bar-card-${i}`);
        const gaugeCards = document.querySelectorAll('.mini-gauge-card');
        const gaugeCard = gaugeCards[i];
        
        let visible = true;
        if (tipo === 'reg') {
            visible = (i === 0 || i === 1 || i === 2);
        } else if (tipo === 'ecom') {
            visible = (i === 3 || i === 4 || i === 5 || i === 6);
        }
        
        if (barCard) barCard.style.display = visible ? 'flex' : 'none';
        if (gaugeCard) gaugeCard.style.display = visible ? 'flex' : 'none';
    }

    setTimeout(() => {
        barCharts.forEach(c => c && c.resize());
        gaugeCharts.forEach(c => c && c.resize());
    }, 50);
}
