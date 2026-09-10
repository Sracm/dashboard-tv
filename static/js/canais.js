// ============================================================
// canais.js — Aba CANAIS
// Varejo Especializado, Distribuição, Comex e E-Commerce
// ============================================================

let canaisData = [];
let chartInstances = {};
let currentMode = 'todos'; // Exibir todos os 6 canais juntos na mesma tela por padrão
let autoRotateTimer = null;
let isAutoRotating = false;
let nextUpdateSeconds = 600;

const GRUPO_REG = [
    "VAREJO ESPECIALIZADO - SP",
    "VAREJO ESPECIALIZADO REG.",
    "DISTRIBUIÇÃO"
];

const GRUPO_ECOM = [
    "COMEX",
    "E-COMMERCE - MQ",
    "E-COMMERCE - PARLUX"
];

function navigateTab(path) {
    pararTodosAudios();
    const mes = document.getElementById('filter-month') ? document.getElementById('filter-month').value : '';
    const ano = document.getElementById('filter-year') ? document.getElementById('filter-year').value : '';
    window.location.href = `${path}?mes=${mes}&ano=${ano}`;
}

// Parar áudios ao sair ou mudar de página
window.addEventListener('beforeunload', () => pararTodosAudios());
window.addEventListener('pagehide', () => pararTodosAudios());

// Controle para tocar o áudio da meta SOMENTE UMA VEZ por período
function jaTocouMeta(chave, mes, ano) {
    try {
        return localStorage.getItem(`meta_som_tocada_${chave}_${mes}_${ano}`) === 'true';
    } catch (e) {
        return false;
    }
}

function marcarMetaComoTocada(chave, mes, ano) {
    try {
        localStorage.setItem(`meta_som_tocada_${chave}_${mes}_${ano}`, 'true');
    } catch (e) {}
}

function resetarMetaTocada(chave, mes, ano) {
    try {
        localStorage.removeItem(`meta_som_tocada_${chave}_${mes}_${ano}`);
    } catch (e) {}
}

function resetarTodasMetasTocadasDoMes(mes, ano) {
    try {
        const chaves = ['parlux', 'empresa', 'distribuicao', 'ecommerce', 'comex', 'varejo_sp', 'varejo_reg'];
        chaves.forEach(k => {
            localStorage.removeItem(`meta_som_tocada_${k}_${mes}_${ano}`);
        });
    } catch (e) {}
function obterChaveCanal(nome) {
    const eqName = (nome || '').toUpperCase().trim();
    if (eqName.includes('PARLUX')) return 'parlux';
    if (eqName === 'EMPRESA') return 'empresa';
    if (eqName.includes('DISTRIBUI') || eqName === 'DISTRIBUIÇÃO' || eqName === 'DISTRIBUICAO') return 'distribuicao';
    if (eqName.includes('E-COMMERCE') || eqName.includes('ECOMMERCE')) return 'ecommerce';
    if (eqName.includes('COMEX')) return 'comex';
    if (eqName.includes('VAREJO') && eqName.includes('SP')) return 'varejo_sp';
    if (eqName.includes('VAREJO') && eqName.includes('REG')) return 'varejo_reg';
    return null;
}

function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('date');
    if (clockEl) clockEl.innerText = now.toLocaleTimeString('pt-BR');
    if (dateEl) dateEl.innerText = now.toLocaleDateString('pt-BR');

    nextUpdateSeconds--;
    if (nextUpdateSeconds <= 0) {
        nextUpdateSeconds = 600;
        fetchData();
    }
    
    const nextUpdateEl = document.getElementById('next-update');
    if (nextUpdateEl) {
        const min = Math.floor(nextUpdateSeconds / 60);
        const sec = nextUpdateSeconds % 60;
        nextUpdateEl.innerText = `Próxima atualização em: ${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
}

function getCanalGaugeOption(percent, isLarge) {
    const diff = percent - 100;
    const sign = diff >= 0 ? '+' : '';
    const diffText = sign + diff.toFixed(1) + '%';
    const diffColor = diff >= 0 ? '#28a745' : '#FF3333';

    const radius = isLarge ? '110%' : '92%';
    const center = isLarge ? ['50%', '70%'] : ['50%', '68%'];
    const lineWidth = isLarge ? 30 : 14;
    const pointerWidth = isLarge ? 12 : 6;
    const titleSize = isLarge ? 28 : 16;
    const detailSize = isLarge ? 22 : 12;
    const labelSize = isLarge ? 13 : 8;
    const labelDistance = isLarge ? -36 : -18;

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
                            [80 / 120, '#dc3545'],
                            [100 / 120, '#ffc107'],
                            [1, '#28a745']
                        ]
                    }
                },
                pointer: {
                    icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
                    length: '62%',
                    width: pointerWidth,
                    offsetCenter: [0, '-5%'],
                    itemStyle: { color: '#0d6efd' }
                },
                axisTick: {
                    length: isLarge ? 10 : 5,
                    lineStyle: { color: 'auto', width: 1.5 }
                },
                splitLine: {
                    length: isLarge ? 18 : 9,
                    lineStyle: { color: 'auto', width: isLarge ? 3 : 2 }
                },
                axisLabel: {
                    show: false
                },
                title: {
                    offsetCenter: [0, '20%'],
                    fontSize: titleSize,
                    color: '#0d6efd',
                    fontWeight: 'bolder'
                },
                detail: {
                    fontSize: detailSize,
                    offsetCenter: [0, '50%'],
                    valueAnimation: true,
                    formatter: function () {
                        return diffText;
                    },
                    color: diffColor,
                    fontWeight: 'bold'
                },
                data: [{ value: Math.min(Math.max(percent, 0), 120), name: percent.toFixed(1) + '%' }]
            }
        ]
    };
}

function setViewMode(mode) {
    pararTodosAudios();
    currentMode = mode;
    
    // Atualizar visual dos botões
    document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-mode-${mode}`);
    if (activeBtn) activeBtn.classList.add('active');

    renderCards();
}

function toggleAutoRotate() {
    isAutoRotating = !isAutoRotating;
    const btn = document.getElementById('btn-auto-rotate');
    
    if (isAutoRotating) {
        if (btn) btn.classList.add('auto-rotate-active');
        if (currentMode === 'todos') currentMode = 'reg';
        setViewMode(currentMode);
        
        autoRotateTimer = setInterval(() => {
            const nextMode = currentMode === 'reg' ? 'ecom' : 'reg';
            setViewMode(nextMode);
        }, 15000);
    } else {
        if (btn) btn.classList.remove('auto-rotate-active');
        if (autoRotateTimer) {
            clearInterval(autoRotateTimer);
            autoRotateTimer = null;
        }
    }
}

function renderCards() {
    const container = document.getElementById('canais-container');
    if (!container) return;

    // Destruir gráficos anteriores
    Object.values(chartInstances).forEach(c => c && c.dispose());
    chartInstances = {};

    let canaisToShow = [];
    let isLarge = false;

    if (currentMode === 'reg') {
        canaisToShow = GRUPO_REG;
        container.className = 'grid-canais-3';
        isLarge = true;
    } else if (currentMode === 'ecom') {
        canaisToShow = GRUPO_ECOM;
        container.className = 'grid-canais-3';
        isLarge = true;
    } else {
        canaisToShow = [...GRUPO_REG, ...GRUPO_ECOM];
        container.className = 'grid-canais-6';
        isLarge = false;
    }

    container.innerHTML = '';

    canaisToShow.forEach((nomeCanal, idx) => {
        const canalItem = canaisData.find(c => c.name === nomeCanal || (nomeCanal === 'E-COMMERCE - MQ' && c.name === 'E-COMMERCE') || (nomeCanal === 'E-COMMERCE' && c.name === 'E-COMMERCE - MQ')) || {
            name: nomeCanal,
            percent: 0.0,
            realizado: 0,
            meta: 0
        };

        const card = document.createElement('div');
        card.className = 'canal-card';
        if (canalItem.percent >= 100) {
            card.classList.add('meta-batida');
        }
        card.id = `card-canal-${idx}`;

        const titleText = (nomeCanal === 'E-COMMERCE' || nomeCanal === 'E-COMMERCE - MQ') ? 'E-COMMERCE - MQ' : nomeCanal;

        card.innerHTML = `
            <div class="canal-title">${titleText}</div>
            <div class="canal-chart" id="chart-canal-${idx}"></div>
        `;
        container.appendChild(card);

        // Inicializar ECharts
        const chartEl = document.getElementById(`chart-canal-${idx}`);
        if (chartEl) {
            const chart = echarts.init(chartEl);
            chart.setOption(getCanalGaugeOption(canalItem.percent, isLarge));
            chartInstances[idx] = chart;
        }
    });
}

let lastPeriodLoaded = '';

async function fetchData() {
    const mes = document.getElementById('filter-month').value;
    const ano = document.getElementById('filter-year').value;
    
    const currentPeriod = `${mes}_${ano}`;
    if (lastPeriodLoaded && lastPeriodLoaded !== currentPeriod) {
        pararTodosAudios();
    }
    lastPeriodLoaded = currentPeriod;
    
    try {
        const response = await fetch(`/api/vendas_tv?mes=${mes}&ano=${ano}`);
        const json = await response.json();
        
        if (json.success && json.data) {
            canaisData = json.data;
            renderCards();


            const lastUpdateEl = document.getElementById('last-update');
            if (lastUpdateEl) {
                lastUpdateEl.innerText = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
            }
        }
    } catch (e) {
        console.error("Erro ao carregar dados dos canais:", e);
    }
}

function manualRefresh() {
    pararTodosAudios();
    const m = document.getElementById('filter-month').value;
    const y = document.getElementById('filter-year').value;
    resetarTodasMetasTocadasDoMes(m, y);
    nextUpdateSeconds = 600;
    fetchData();
}

// ─── SISTEMA DE FILA SEQUENCIAL DE ÁUDIOS DE META ───────────
const AUDIO_CONFIG = {
    'empresa':      { id: 'music-sound',        duration: 28000, nome: 'Empresa (Van Halen - Jump)' },
    'distribuicao': { id: 'audio-distribuicao', duration: 30000, nome: 'Distribuição (The Who - Who Are You)' },
    'ecommerce':    { id: 'audio-ecommerce',    duration: 30000, nome: 'E-commerce (Deep Purple - Perfect Strangers)' },
    'comex':        { id: 'audio-comex',        duration: 30000, nome: 'Comex (Led Zeppelin - Whole Lotta Love)' },
    'varejo_sp':    { id: 'audio-varejo-sp',    duration: 18000, nome: 'Varejo SP (Creedence Clearwater Revival - Fortunate Son)' },
    'varejo_reg':   { id: 'audio-varejo-reg',   duration: 12000, nome: 'Varejo Reg (ZZ Top - La Grange)' },
    'parlux':       { id: 'audio-parlux',       duration: 28000, nome: 'Parlux (Heart - Barracuda)' },
    'sirene':       { id: 'victory-sound',      duration: 10000, nome: 'Sirene de Vitória' }
};

let audioQueue = [];
let audioQueueRunning = false;
let currentAudioTimeout = null;
let currentAudioElement = null;

function pararTodosAudios() {
    audioQueue = [];
    audioQueueRunning = false;

    if (currentAudioTimeout) {
        clearTimeout(currentAudioTimeout);
        currentAudioTimeout = null;
    }

    if (currentAudioElement) {
        currentAudioElement.onended = null;
        currentAudioElement = null;
    }

    const allAudioIds = [
        'victory-sound', 'music-sound', 'audio-distribuicao',
        'audio-ecommerce', 'audio-comex', 'audio-varejo-sp',
        'audio-varejo-reg', 'audio-parlux'
    ];

    allAudioIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            try {
                el.pause();
                el.currentTime = 0;
                el.onended = null;
            } catch (e) {}
        }
    });
}

function enfileirarAudio(tipo) {
    if (!AUDIO_CONFIG[tipo]) return;

    if (audioQueue.includes(tipo)) return;

    audioQueue.push(tipo);
    console.log(`[Áudio Fila] Adicionado à fila: ${AUDIO_CONFIG[tipo].nome}. Fila:`, audioQueue);

    if (!audioQueueRunning) {
        processarFilaAudios();
    }
}

function processarFilaAudios() {
    if (audioQueueRunning) return;
    if (audioQueue.length === 0) {
        console.log('[Áudio Fila] Fila finalizada.');
        return;
    }

    const proximoTipo = audioQueue.shift();
    const config = AUDIO_CONFIG[proximoTipo];
    if (!config) {
        processarFilaAudios();
        return;
    }

    const audioEl = document.getElementById(config.id);
    if (!audioEl) {
        console.warn(`Elemento #${config.id} não encontrado no DOM.`);
        processarFilaAudios();
        return;
    }

    audioQueueRunning = true;
    currentAudioElement = audioEl;

    const allAudioIds = [
        'victory-sound', 'music-sound', 'audio-distribuicao',
        'audio-ecommerce', 'audio-comex', 'audio-varejo-sp',
        'audio-varejo-reg', 'audio-parlux'
    ];
    allAudioIds.forEach(id => {
        if (id !== config.id) {
            const el = document.getElementById(id);
            if (el) {
                try {
                    el.pause();
                    el.currentTime = 0;
                    el.onended = null;
                } catch (e) {}
            }
        }
    });

    audioEl.currentTime = 0;
    audioEl.volume = 1.0;

    let finalizado = false;
    const finalizarAudio = () => {
        if (finalizado) return;
        finalizado = true;

        if (currentAudioTimeout) {
            clearTimeout(currentAudioTimeout);
            currentAudioTimeout = null;
        }

        try {
            audioEl.pause();
            audioEl.currentTime = 0;
            audioEl.onended = null;
        } catch (e) {}

        audioQueueRunning = false;
        currentAudioElement = null;

        if (audioQueue.length > 0) {
            console.log(`[Áudio Fila] Finalizado: ${config.nome}. Aguardando 20 segundos de intervalo antes da próxima música. Restantes na fila: ${audioQueue.length}`);
            currentAudioTimeout = setTimeout(() => {
                currentAudioTimeout = null;
                processarFilaAudios();
            }, 20000); // 20 segundos de espera
        } else {
            console.log(`[Áudio Fila] Finalizado: ${config.nome}. Todas as músicas da fila foram concluídas.`);
        }
    };

    audioEl.onended = finalizarAudio;

    console.log(`[Áudio Fila] 🎵 Tocando: ${config.nome} (${config.duration / 1000}s)`);
    audioEl.play().then(() => {
        currentAudioTimeout = setTimeout(finalizarAudio, config.duration);
    }).catch(e => {
        console.warn(`Erro ao tocar áudio ${config.nome}:`, e);
        finalizarAudio();
    });
}

function tocarAudioDistribuicao() {
    enfileirarAudio('distribuicao');
}

function tocarAudioEmpresa() {
    enfileirarAudio('empresa');
}

function tocarAudioEcommerce() {
    enfileirarAudio('ecommerce');
}

function tocarAudioComex() {
    enfileirarAudio('comex');
}

function tocarAudioVarejoSp() {
    enfileirarAudio('varejo_sp');
}

function tocarAudioVarejoReg() {
    enfileirarAudio('varejo_reg');
}

function tocarAudioParlux() {
    enfileirarAudio('parlux');
}

function testarAudio(tipo) {
    pararTodosAudios();
    if (tipo && AUDIO_CONFIG[tipo]) {
        enfileirarAudio(tipo);
    } else {
        enfileirarAudio('sirene');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const mesParam = params.get('mes');
    const anoParam = params.get('ano');
    
    if (mesParam) document.getElementById('filter-month').value = mesParam;
    if (anoParam) document.getElementById('filter-year').value = anoParam;

    fetchData();

    setInterval(updateClock, 1000);
    updateClock();

    window.addEventListener('resize', () => {
        Object.values(chartInstances).forEach(c => c && c.resize());
    });
});
