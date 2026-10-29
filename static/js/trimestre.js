// ============================================================
// trimestre.js - Painel Financeiro Trimestral (Layout Canais TV)
// Despesas Fixas, Variáveis, Totais, Faturamento e Lucro Líquido
// ============================================================

let chartInstances = {};
let nextUpdateSeconds = 600;
let currentTrimestre = '3T'; // Default: 3º TRIM

const TRI_LABELS = {
    '1T': '1º TRI (JAN-MAR)',
    '2T': '2º TRI (ABR-JUN)',
    '3T': '3º TRI (JUL-SET)',
    '4T': '4º TRI (OUT-DEZ)'
};

function navigateTab(path) {
    pararTodosAudios();
    if (path === '/tv' || path === '/') {
        window.location.href = '/tv';
        return;
    }
    const ano = document.getElementById('filter-year')?.value || new Date().getFullYear();
    window.location.href = `${path}?ano=${ano}`;
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

/**
 * Cria o Gauge Radial idêntico aos Canais de Vendas
 */
function getCanalGaugeOption(percent, displayStr, diffVal, isLarge) {
    const diff = (diffVal !== undefined && diffVal !== null) ? Number(diffVal) : (percent - 100);
    const sign = diff >= 0 ? '+' : '';
    const diffText = sign + diff.toFixed(1) + '%';
    const diffColor = diff >= 0 ? '#00d26a' : '#ff2424';

    const radius = isLarge ? '120%' : '125%';
    const center = isLarge ? ['50%', '70%'] : ['50%', '65%'];
    const lineWidth = isLarge ? 24 : 18;
    const pointerWidth = isLarge ? 8 : 7;
    const titleSize = isLarge ? 26 : 22;
    const detailSize = isLarge ? 16 : 14;

    const mainDisplay = displayStr || (percent.toFixed(1) + '%');

    return {
        series: [
            {
                type: 'gauge',
                startAngle: 180,
                endAngle: 0,
                min: 0,
                max: 120,
                splitNumber: 12,
                radius: radius,
                center: center,
                axisLine: {
                    lineStyle: {
                        width: lineWidth,
                        color: [
                            [80 / 120, '#ff2424'],
                            [100 / 120, '#ffd600'],
                            [1, '#00d26a']
                        ]
                    }
                },
                pointer: {
                    icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
                    length: '62%',
                    width: pointerWidth,
                    offsetCenter: [0, '-4%'],
                    itemStyle: {
                        color: '#f5c518',
                        shadowColor: 'rgba(0,0,0,0.6)',
                        shadowBlur: 4
                    }
                },
                axisTick: {
                    length: isLarge ? 8 : 5,
                    lineStyle: { color: 'auto', width: 1.2 }
                },
                splitLine: {
                    length: isLarge ? 14 : 10,
                    lineStyle: { color: 'auto', width: 2 }
                },
                axisLabel: {
                    show: false
                },
                title: {
                    offsetCenter: [0, '15%'],
                    fontSize: titleSize,
                    color: '#ffffff',
                    fontWeight: '800',
                    fontFamily: 'Montserrat'
                },
                detail: {
                    fontSize: detailSize,
                    offsetCenter: [0, '38%'],
                    valueAnimation: false,
                    formatter: function () {
                        return diffText;
                    },
                    color: diffColor,
                    fontWeight: '700',
                    fontFamily: 'Montserrat'
                },
                data: [{
                    value: Math.min(Math.max(percent, 0), 120),
                    name: mainDisplay
                }]
            }
        ]
    };
}

/**
 * Renderiza os badges de trimestres (T1, T2, T3, T4) na base do card
 */
function renderQuarterBadges(reguaObj, activeTri) {
    const quarters = ['1T', '2T', '3T', '4T'];
    return quarters.map(tKey => {
        const item = reguaObj ? reguaObj[tKey] : null;
        let pct = item ? Number(item.percent) : null;
        let valStr = '—';
        let cls = 'val-neutral';

        if (pct !== null && !isNaN(pct)) {
            valStr = item.display || (pct.toFixed(1) + '%');
            if (pct >= 100) cls = 'val-success';
            else if (pct >= 80) cls = 'val-warning';
            else cls = 'val-danger';
        }

        const isSelected = (activeTri === tKey);
        const selClass = isSelected ? 'selected' : '';

        return `
            <div class="tri-badge-btn ${selClass}" onclick="setTrimestreView('${tKey}')" title="Clique para exibir o ${TRI_LABELS[tKey]} (${valStr})">
                <span>${tKey}</span>
                <span class="tri-badge-val ${cls}">${valStr}</span>
            </div>
        `;
    }).join('');
}

function renderCards(cardsList, selectedTri) {
    const container = document.getElementById('trimestre-cards-container');
    if (!container) return;

    Object.values(chartInstances).forEach(c => c && c.dispose());
    chartInstances = {};
    container.innerHTML = '';

    cardsList.forEach((item, idx) => {
        const isBatida = (Number(item.percent) >= 100);
        const card = document.createElement('div');
        card.className = 'canal-card';
        if (isBatida) {
            card.classList.add('meta-batida');
        }
        card.id = `card-trimestre-${idx}`;

        const isLarge = (idx === 0 || idx === 1); // 1ª linha mais larga

        card.innerHTML = `
            <div class="canal-title">${item.title}</div>
            <div class="badge-objetivo-alcancado">OBJETIVO ALCANÇADO!!!</div>
            <div class="canal-chart" id="chart-tri-${idx}"></div>
            <div class="canal-tri-footer">
                <div class="canal-tri-badges">
                    ${renderQuarterBadges(item.regua, selectedTri)}
                </div>
            </div>
        `;

        container.appendChild(card);

        const chartEl = document.getElementById(`chart-tri-${idx}`);
        if (chartEl) {
            const chart = echarts.init(chartEl);
            chart.setOption(getCanalGaugeOption(item.percent, item.display, item.diff, isLarge));
            chartInstances[idx] = chart;
        }
    });
}

function setTrimestreView(triKey) {
    currentTrimestre = triKey;
    document.querySelectorAll('#trimestres-pills-container .sub-tab-btn').forEach(b => {
        b.classList.toggle('active', b.id === `btn-tri-${triKey}`);
    });
    fetchData();
}

function trocarAno() {
    fetchData();
}

async function fetchData(forceRefresh = false) {
    const ano = document.getElementById('filter-year')?.value || '2026';

    try {
        let url = `/api/trimestre_tv?ano=${ano}&trimestre=${currentTrimestre}`;
        if (forceRefresh) {
            url += `&refresh=1&_t=${Date.now()}`;
        }
        const response = await fetch(url);
        const json = await response.json();

        if (json.success && json.data) {
            if (json.trimestres_disponiveis && json.trimestres_disponiveis.length > 0) {
                const pillsCont = document.getElementById('trimestres-pills-container');
                if (pillsCont) {
                    pillsCont.innerHTML = json.trimestres_disponiveis.map(t => {
                        const labelFull = TRI_LABELS[t.chave] || t.chave;
                        return `
                            <button class="sub-tab-btn ${t.ativo ? 'active' : ''}" id="btn-tri-${t.chave}" onclick="setTrimestreView('${t.chave}')">
                                ${labelFull}
                            </button>
                        `;
                    }).join('');
                }
            }

            renderCards(json.data, json.trimestre_selecionado || currentTrimestre);

            const lastUpdateEl = document.getElementById('last-update');
            if (lastUpdateEl) {
                lastUpdateEl.innerText = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
            }
        }
    } catch (e) {
        console.error("Erro ao carregar dados do trimestre:", e);
    }
}

function manualRefresh() {
    nextUpdateSeconds = 600;
    fetchData(true);
}

function pararTodosAudios() {
    const audioMusica = document.getElementById('music-sound');
    if (audioMusica) {
        audioMusica.pause();
        audioMusica.currentTime = 0;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const anoParam = params.get('ano');
    const triParam = params.get('trimestre') || params.get('tri');

    if (anoParam && document.getElementById('filter-year')) {
        document.getElementById('filter-year').value = anoParam;
    }
    if (triParam) {
        currentTrimestre = triParam.toUpperCase();
    }

    fetchData();

    setInterval(updateClock, 1000);
    updateClock();

    window.addEventListener('resize', () => {
        Object.values(chartInstances).forEach(c => c && c.resize());
    });
});
