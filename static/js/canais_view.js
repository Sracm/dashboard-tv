// canais_view.js — Renderizador dinâmico de canais
let chartInstances = {};
let nextUpdateSeconds = 600;

function navigateTab(path) {
    pararTodosAudios();
    if (path === '/tv' || path === '/') {
        window.location.href = '/tv';
        return;
    }
    const mes = document.getElementById('filter-month') ? document.getElementById('filter-month').value : '';
    const ano = document.getElementById('filter-year') ? document.getElementById('filter-year').value : '';
    window.location.href = `${path}?mes=${mes}&ano=${ano}`;
}

// Parar áudio ao sair ou mudar de tela
window.addEventListener('beforeunload', () => pararTodosAudios());
window.addEventListener('pagehide', () => pararTodosAudios());

// Controle para tocar áudio SOMENTE UMA VEZ por período
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

    const radius = isLarge ? '108%' : '98%';
    const center = isLarge ? ['50%', '68%'] : ['50%', '64%'];
    const lineWidth = isLarge ? 30 : 21;
    const pointerWidth = isLarge ? 11 : 8;
    const titleSize = isLarge ? 30 : 24;
    const detailSize = isLarge ? 20 : 16;
    const labelSize = isLarge ? 14 : 10.5;
    const labelDistance = isLarge ? -40 : -25;

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
                    length: '60%',
                    width: pointerWidth,
                    offsetCenter: [0, '-4%'],
                    itemStyle: { color: '#0d6efd' }
                },
                axisTick: {
                    length: isLarge ? 10 : 7,
                    lineStyle: { color: 'auto', width: 1.5 }
                },
                splitLine: {
                    length: isLarge ? 18 : 12,
                    lineStyle: { color: 'auto', width: isLarge ? 3 : 2.5 }
                },
                axisLabel: {
                    show: false
                },
                title: {
                    offsetCenter: [0, '14%'],
                    fontSize: titleSize,
                    color: '#0d6efd',
                    fontWeight: 'bolder'
                },
                detail: {
                    fontSize: detailSize,
                    offsetCenter: [0, '31%'],
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

function renderCards(dadosEquipes) {
    const container = document.getElementById('canais-container');
    if (!container) return;

    Object.values(chartInstances).forEach(c => c && c.dispose());
    chartInstances = {};
    container.innerHTML = '';

    GRUPO_ESPECIFICO.forEach((nomeCanal, idx) => {
        const canalItem = dadosEquipes.find(c => c.name === nomeCanal || (nomeCanal === 'E-COMMERCE - MQ' && c.name === 'E-COMMERCE') || (nomeCanal === 'E-COMMERCE' && c.name === 'E-COMMERCE - MQ')) || {
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

        const chartEl = document.getElementById(`chart-canal-${idx}`);
        if (chartEl) {
            const chart = echarts.init(chartEl);
            chart.setOption(getCanalGaugeOption(canalItem.percent, IS_LARGE_VIEW));
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
            renderCards(json.data);
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
            }, 20000);
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
    const now = new Date();
    // Na guia Todos os Canais, SEMPRE deixar setado o mês atual e ano atual
    if (document.getElementById('filter-month')) {
        document.getElementById('filter-month').value = now.getMonth() + 1;
    }
    if (document.getElementById('filter-year')) {
        document.getElementById('filter-year').value = now.getFullYear();
    }

    fetchData();

    setInterval(updateClock, 1000);
    updateClock();

    window.addEventListener('resize', () => {
        Object.values(chartInstances).forEach(c => c && c.resize());
    });
});
