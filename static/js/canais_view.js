// canais_view.js — Renderizador dinâmico de canais
let chartInstances = {};
let nextUpdateSeconds = 600;

function navigateTab(path) {
    pararTodosAudios();
    if (path === '/tv' || path === '/') {
        window.location.href = '/tv';
        return;
    }
    const now = new Date();
    const realM = now.getMonth() + 1;
    const realY = now.getFullYear();

    let mes = document.getElementById('filter-month') ? parseInt(document.getElementById('filter-month').value, 10) : realM;
    let ano = document.getElementById('filter-year') ? parseInt(document.getElementById('filter-year').value, 10) : realY;

    if (isNaN(mes) || (ano >= realY && mes > realM)) {
        mes = realM;
    }
    if (isNaN(ano)) ano = realY;

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
        fetchData(true);
    }
    
    const nextUpdateEl = document.getElementById('next-update');
    if (nextUpdateEl) {
        const min = Math.floor(nextUpdateSeconds / 60);
        const sec = nextUpdateSeconds % 60;
        nextUpdateEl.innerText = `Próxima atualização em: ${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
}

let currentPeriodo = 'mes'; // 'mes', 'T1', 'T2', 'T3', 'T4'
let quarterlyCache = {};
let lastPeriodLoaded = '';

function formatCurrency(val) {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function setPeriodoView(periodo) {
    if (currentPeriodo === periodo) return;
    currentPeriodo = periodo;

    document.querySelectorAll('.sub-nav-canais .sub-tab-btn').forEach(b => {
        b.classList.remove('active');
    });

    const activeBtn = document.getElementById(`btn-periodo-${periodo.toLowerCase()}`);
    if (activeBtn) activeBtn.classList.add('active');

    const monthSelect = document.getElementById('filter-month');
    if (monthSelect) {
        if (periodo === 'mes') {
            monthSelect.disabled = false;
            monthSelect.style.opacity = '1';
            monthSelect.title = 'Filtrar mês específico';
        } else {
            monthSelect.disabled = true;
            monthSelect.style.opacity = '0.4';
            monthSelect.title = `Visualizando ${periodo} completo (soma do trimestre)`;
        }
    }

    fetchData();
}

function getCanalGaugeOption(percent, isLarge) {
    const diff = percent - 100;
    const sign = diff >= 0 ? '+' : '';
    const diffText = sign + diff.toFixed(1) + '%';
    const diffColor = diff >= 0 ? '#00d26a' : '#ff2424';

    const radius = isLarge ? '115%' : '125%';
    const center = isLarge ? ['50%', '70%'] : ['50%', '65%'];
    const lineWidth = isLarge ? 26 : 18;
    const pointerWidth = isLarge ? 9 : 7;
    const titleSize = isLarge ? 28 : 22;
    const detailSize = isLarge ? 17 : 14;

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
                    valueAnimation: true,
                    formatter: function () {
                        return diffText;
                    },
                    color: diffColor,
                    fontWeight: '700',
                    fontFamily: 'Montserrat'
                },
                data: [{ value: Math.min(Math.max(percent, 0), 120), name: percent.toFixed(1) + '%' }]
            }
        ]
    };
}

async function getTrimestreData(ano, forceRefresh = false) {
    if (!forceRefresh && quarterlyCache[ano]) {
        return quarterlyCache[ano];
    }

    // 1. Tenta endpoint direto do backend se já estiver disponível
    try {
        let url = `/api/canais_trimestre_tv?ano=${ano}`;
        if (forceRefresh) url += `&refresh=1&_t=${Date.now()}`;
        const res = await fetch(url);
        if (res.ok) {
            const j = await res.json();
            if (j.success && j.data) {
                const raw = j.data;
                const normalized = {
                    T1: raw.T1 || [],
                    T2: raw.T2 || [],
                    T3: raw.T3 || [],
                    T4: raw.T4 || [],
                    by_canal: raw.by_canal || {}
                };

                // Se o backend retornou apenas indexado por canal, converte para arrays T1..T4
                if ((!normalized.T1 || normalized.T1.length === 0) && Object.keys(raw).length > 0) {
                    const canaisList = [
                        "VAREJO ESPECIALIZADO - SP",
                        "VAREJO ESPECIALIZADO REG.",
                        "DISTRIBUIÇÃO",
                        "COMEX",
                        "E-COMMERCE - MQ",
                        "E-COMMERCE - PARLUX"
                    ];
                    ['T1', 'T2', 'T3', 'T4'].forEach(tKey => {
                        normalized[tKey] = [];
                        canaisList.forEach(cName => {
                            const cInfo = (raw[cName] && raw[cName][tKey]) || 
                                          (cName.includes('MQ') && raw['E-COMMERCE'] && raw['E-COMMERCE'][tKey]) || {};
                            normalized[tKey].push({
                                name: cName,
                                realizado: Number(cInfo.realizado) || 0,
                                meta: Number(cInfo.meta) || 0,
                                percent: Number(cInfo.percent) || 0,
                                diff: Number(cInfo.diff) || 0
                            });
                        });
                    });
                }

                quarterlyCache[ano] = normalized;
                return normalized;
            }
        }
    } catch (err) {
        console.warn("Falha ao buscar /api/canais_trimestre_tv:", err);
    }

    // 2. Fallback de cálculo imediato no cliente caso a rota não responda
    try {
        const meses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        const responses = await Promise.all(
            meses.map(m => fetch(`/api/vendas_tv?mes=${m}&ano=${ano}`).then(r => r.json()).catch(() => null))
        );

        const triMonths = {
            T1: [1, 2, 3],
            T2: [4, 5, 6],
            T3: [7, 8, 9],
            T4: [10, 11, 12]
        };

        const result = { T1: [], T2: [], T3: [], T4: [], by_canal: {} };
        const canaisList = [
            "VAREJO ESPECIALIZADO - SP",
            "VAREJO ESPECIALIZADO REG.",
            "DISTRIBUIÇÃO",
            "COMEX",
            "E-COMMERCE - MQ",
            "E-COMMERCE - PARLUX"
        ];

        ['T1', 'T2', 'T3', 'T4'].forEach(triKey => {
            const targetMonths = triMonths[triKey];
            const mesesData = targetMonths.map(m => responses[m - 1]);

            canaisList.forEach(canalNome => {
                let totalReal = 0;
                let totalMeta = 0;

                mesesData.forEach(mResp => {
                    if (mResp && mResp.success && mResp.data) {
                        const item = mResp.data.find(c => 
                            c.name === canalNome || 
                            (canalNome === 'E-COMMERCE - MQ' && c.name === 'E-COMMERCE') ||
                            (canalNome === 'E-COMMERCE' && c.name === 'E-COMMERCE - MQ')
                        );
                        if (item) {
                            totalReal += Number(item.realizado || 0);
                            totalMeta += Number(item.meta || 0);
                        }
                    }
                });

                const percent = totalMeta > 0 ? (totalReal / totalMeta) * 100 : 0.0;
                result[triKey].push({
                    name: canalNome,
                    realizado: totalReal,
                    meta: totalMeta,
                    percent: percent
                });
            });
        });

        quarterlyCache[ano] = result;
        return result;
    } catch (e) {
        console.error("Erro ao calcular trimestres:", e);
        return null;
    }
}

function normalizarNomeCanal(str) {
    if (!str) return '';
    return str.toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
}

function matchCanal(a, b) {
    const na = normalizarNomeCanal(a);
    const nb = normalizarNomeCanal(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.includes('COMMERCE') && nb.includes('COMMERCE')) {
        const aIsParlux = na.includes('PARLUX');
        const bIsParlux = nb.includes('PARLUX');
        return aIsParlux === bIsParlux;
    }
    if (na.includes('DISTRIBUI') && nb.includes('DISTRIBUI')) return true;
    if (na.includes('VAREJO') && nb.includes('VAREJO')) {
        const aIsReg = na.includes('REG');
        const bIsReg = nb.includes('REG');
        return aIsReg === bIsReg;
    }
    if (na.includes('COMEX') && nb.includes('COMEX')) return true;
    return false;
}

function renderQuarterBadges(nomeCanal, triData, activePeriodo) {
    if (!triData) return '';
    const triLabels = { T1: 'T1', T2: 'T2', T3: 'T3', T4: 'T4' };
    
    return ['T1', 'T2', 'T3', 'T4'].map(tKey => {
        let pct = null;
        let meta = null;
        const isSelected = (activePeriodo === tKey);

        // 1. Procura no array triData[tKey]
        const canalList = triData[tKey] || [];
        const item = canalList.find(c => matchCanal(c.name, nomeCanal));

        if (item) {
            pct = Number(item.percent);
            meta = Number(item.meta);
        } else {
            // 2. Procura no formato indexado por canal (triData.by_canal ou triData[nomeCanal])
            const byCanal = triData.by_canal || triData;
            for (const [k, v] of Object.entries(byCanal)) {
                if (matchCanal(k, nomeCanal) && v && v[tKey]) {
                    pct = Number(v[tKey].percent);
                    meta = Number(v[tKey].meta);
                    break;
                }
            }
        }

        let cls = 'val-neutral';
        let valStr = '—';

        if (pct !== null && !isNaN(pct) && (meta > 0 || pct > 0)) {
            valStr = pct.toFixed(1) + '%';
            if (pct >= 100) cls = 'val-success';
            else if (pct >= 80) cls = 'val-warning';
            else cls = 'val-danger';
        } else if (pct === 0 && (meta === 0 || meta === null)) {
            valStr = '0.0%';
            cls = 'val-neutral';
        }

        const selClass = isSelected ? 'selected' : '';

        return `
            <div class="tri-badge-btn ${selClass}" onclick="setPeriodoView('${tKey}')" title="Clique para exibir o ${triLabels[tKey]} de todos os canais (${valStr})">
                <span>${triLabels[tKey]}</span>
                <span class="tri-badge-val ${cls}">${valStr}</span>
            </div>
        `;
    }).join('');
}

function renderCards(dadosEquipes, periodoKey = 'mes', triData = null) {
    const container = document.getElementById('canais-container');
    if (!container) return;

    Object.values(chartInstances).forEach(c => c && c.dispose());
    chartInstances = {};
    container.innerHTML = '';

    const triNames = {
        'T1': '1º TRI (JAN-MAR)',
        'T2': '2º TRI (ABR-JUN)',
        'T3': '3º TRI (JUL-SET)',
        'T4': '4º TRI (OUT-DEZ)'
    };

    GRUPO_ESPECIFICO.forEach((nomeCanal, idx) => {
        const canalItem = (dadosEquipes || []).find(c => matchCanal(c.name, nomeCanal)) || {
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

        let baseTitle = (nomeCanal === 'E-COMMERCE' || nomeCanal === 'E-COMMERCE - MQ') ? 'E-COMMERCE - MQ' : nomeCanal;
        let tagHtml = '';
        if (periodoKey !== 'mes' && triNames[periodoKey]) {
            tagHtml = `<span class="tri-tag">${triNames[periodoKey]}</span>`;
        }

        card.innerHTML = `
            <div class="canal-title">${baseTitle} ${tagHtml}</div>
            <div class="badge-objetivo-alcancado">OBJETIVO ALCANÇADO!!!</div>
            <div class="canal-chart" id="chart-canal-${idx}"></div>
            <div class="canal-tri-footer">
                <div class="canal-tri-badges">
                    ${renderQuarterBadges(nomeCanal, triData, periodoKey)}
                </div>
            </div>
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

async function fetchData(forceRefresh = false) {
    const mes = document.getElementById('filter-month').value;
    const ano = document.getElementById('filter-year').value;
    
    const currentPeriod = `${currentPeriodo}_${mes}_${ano}`;
    if (lastPeriodLoaded && lastPeriodLoaded !== currentPeriod) {
        pararTodosAudios();
    }
    lastPeriodLoaded = currentPeriod;
    
    try {
        const triPromise = getTrimestreData(ano, forceRefresh);

        if (currentPeriodo === 'mes') {
            let url = `/api/vendas_tv?mes=${mes}&ano=${ano}`;
            if (forceRefresh) {
                url += `&refresh=1&_t=${Date.now()}`;
            }
            const response = await fetch(url);
            const json = await response.json();
            const triData = await triPromise;
            
            if (json.success && json.data) {
                renderCards(json.data, 'mes', triData);
                verificarOscilacaoCanais(json.data);
                const lastUpdateEl = document.getElementById('last-update');
                if (lastUpdateEl) {
                    lastUpdateEl.innerText = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
                }
            }
        } else {
            // Trimestre selecionado (T1, T2, T3 ou T4)
            const triData = await triPromise;
            if (triData && triData[currentPeriodo]) {
                renderCards(triData[currentPeriodo], currentPeriodo, triData);
                const lastUpdateEl = document.getElementById('last-update');
                if (lastUpdateEl) {
                    lastUpdateEl.innerText = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
                }
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
    quarterlyCache = {};
    fetchData(true);
}

// ─── SISTEMA DE FILA SEQUENCIAL DE ÁUDIOS DE META ───────────
const AUDIO_CONFIG = {
    'empresa':      { id: 'music-sound',        duration: null,  nome: 'Empresa (Van Halen - Jump)' },
    'distribuicao': { id: 'audio-distribuicao', duration: null,  nome: 'Distribuição (Black Sabbath)' },
    'ecommerce':    { id: 'audio-ecommerce',    duration: null,  nome: 'E-commerce (Deep Purple - Perfect Strangers)' },
    'comex':        { id: 'audio-comex',        duration: null,  nome: 'Comex (Led Zeppelin - Whole Lotta Love)' },
    'varejo_sp':    { id: 'audio-varejo-sp',    duration: null,  nome: 'Varejo SP (Creedence Clearwater Revival - Fortunate Son)' },
    'varejo_reg':   { id: 'audio-varejo-reg',   duration: null,  nome: 'Varejo Reg (David Guetta, Hypaton & Europe)' },
    'parlux':       { id: 'audio-parlux',       duration: null,  nome: 'Parlux (Heart - Barracuda)' },
    'caixa':        { id: 'audio-caixa',        duration: 4000,  nome: 'Caixa Registradora' },
    'policia':      { id: 'audio-policia',      duration: 15000, nome: 'Sirene de Polícia' },
    'sirene':       { id: 'audio-policia',      duration: 15000, nome: 'Sirene de Polícia' }
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
        'music-sound', 'audio-distribuicao',
        'audio-ecommerce', 'audio-comex', 'audio-varejo-sp',
        'audio-varejo-reg', 'audio-parlux', 'audio-caixa', 'audio-policia'
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

    if (window.tvRotator && window.tvRotator.retomarAposAudio) {
        window.tvRotator.retomarAposAudio();
    }
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

function enfileirarAudioFrente(tipo) {
    if (!AUDIO_CONFIG[tipo]) return;
    if (audioQueue.includes(tipo)) return;

    audioQueue.unshift(tipo);
    console.log(`[Áudio Fila] Adicionado à frente da fila: ${AUDIO_CONFIG[tipo].nome}. Fila:`, audioQueue);

    if (!audioQueueRunning) {
        processarFilaAudios();
    }
}

let estadoAnteriorCanais = {};

function verificarOscilacaoCanais(dadosEquipes) {
    if (Object.keys(estadoAnteriorCanais).length === 0) {
        (dadosEquipes || []).forEach(eq => {
            estadoAnteriorCanais[eq.name] = Number(eq.percent) || 0;
        });
        return;
    }

    let tocouPositivo = false;
    let tocouNegativo = false;

    (dadosEquipes || []).forEach((eq, idx) => {
        const nome = eq.name;
        const percentAtual = Number(eq.percent) || 0;
        const percentAntigo = Number(estadoAnteriorCanais[nome]);
        const cardEl = document.getElementById(`card-canal-${idx}`);

        if (percentAntigo !== undefined && !Number.isNaN(percentAntigo)) {
            const pAtualFmt = Number(percentAtual.toFixed(1));
            const pAntFmt = Number(percentAntigo.toFixed(1));
            const deltaVisivel = Number((pAtualFmt - pAntFmt).toFixed(1));

            // Sensibilidade diferenciada: >= 0.5% para canais já acima da meta (>= 100%), >= 0.1% para os demais
            const deltaMinimoSubida = (pAntFmt >= 100) ? 0.5 : 0.1;

            // 1. Oscilação para CIMA -> Caixa Registradora
            if (deltaVisivel >= deltaMinimoSubida) {
                if (cardEl) {
                    cardEl.classList.remove('oscilou-baixo');
                    cardEl.classList.add('oscilou-cima');
                }
                if (!tocouPositivo) {
                    tocouPositivo = true;
                    console.log(`[Todos Canais] 💵 SUBIDA REAL em ${nome}: ${pAntFmt.toFixed(1)}% -> ${pAtualFmt.toFixed(1)}% (Δ +${deltaVisivel.toFixed(1)}% >= +${deltaMinimoSubida}%). Caixa Registradora.`);
                    enfileirarAudioFrente('caixa');
                }
            // 2. Redução para BAIXO -> Sirene de Polícia (exige queda visível <= -0.1%)
            } else if (deltaVisivel <= -0.1) {
                if (cardEl) {
                    cardEl.classList.remove('oscilou-cima');
                    cardEl.classList.add('oscilou-baixo');
                }
                if (!tocouNegativo) {
                    tocouNegativo = true;
                    console.log(`[Todos Canais] 🚨 QUEDA REAL em ${nome}: ${pAntFmt.toFixed(1)}% -> ${pAtualFmt.toFixed(1)}% (Δ ${deltaVisivel.toFixed(1)}%). Sirene Polícia.`);
                    enfileirarAudioFrente('policia');
                }
            } else {
                if (cardEl) {
                    cardEl.classList.remove('oscilou-cima', 'oscilou-baixo');
                }
            }
        }

        estadoAnteriorCanais[nome] = percentAtual;
    });
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
        'music-sound', 'audio-distribuicao',
        'audio-ecommerce', 'audio-comex', 'audio-varejo-sp',
        'audio-varejo-reg', 'audio-parlux', 'audio-caixa', 'audio-policia'
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
            audioEl.loop = false;
            audioEl.pause();
            audioEl.currentTime = 0;
            audioEl.onended = null;
        } catch (e) {}

        audioQueueRunning = false;
        currentAudioElement = null;

        if (audioQueue.length === 0 && window.tvRotator && window.tvRotator.retomarAposAudio) {
            window.tvRotator.retomarAposAudio();
        }
        if (audioQueue.length > 0) {
            console.log(`[Áudio Fila] Finalizado: ${config.nome}. Aguardando 20 segundos de intervalo antes da próxima música. Restantes na fila: ${audioQueue.length}`);
            currentAudioTimeout = setTimeout(() => {
                currentAudioTimeout = null;
                processarFilaAudios();
            }, 20000);
        } else {
            console.log(`[Áudio Fila] Finalizado: ${config.nome}. Todas as músicas da fila foram concluídas.`);
            if (window.tvRotator && window.tvRotator.retomarAposAudio) {
                window.tvRotator.retomarAposAudio();
            }
        }
    };

    audioEl.onended = finalizarAudio;

    const durDesc = config.duration ? `${config.duration / 1000}s` : 'música completa';
    console.log(`[Áudio Fila] 🎵 Tocando: ${config.nome} (${durDesc})`);
    audioEl.loop = (config.id === 'audio-policia');
    audioEl.play().then(() => {
        if (config.duration && config.duration > 0) {
            currentAudioTimeout = setTimeout(finalizarAudio, config.duration);
        } else {
            console.log(`[Áudio Fila] 🎵 ${config.nome}: Configurado para tocar a MÚSICA COMPLETA até o final.`);
        }

        if (config.duration === null && window.tvRotator && window.tvRotator.pausarParaAudio) {
            window.tvRotator.pausarParaAudio(config.nome);
        }
    }).catch(e => {
        console.warn(`Erro ao tocar áudio ${config.nome}:`, e);
        audioQueueRunning = false;
        currentAudioElement = null;
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
    if (tipo === 'sirene') tipo = 'policia';
    if (tipo && AUDIO_CONFIG[tipo]) {
        enfileirarAudio(tipo);
    }
}

let userExplicitlyChangedMonth = false;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const paramMes = urlParams.get('mes');
    const paramAno = urlParams.get('ano');

    const now = new Date();
    const realMonth = now.getMonth() + 1;
    const realYear = now.getFullYear();

    let currentMonth = paramMes ? parseInt(paramMes) : realMonth;
    let currentYear = paramAno ? parseInt(paramAno) : realYear;

    if (isNaN(currentMonth) || currentMonth < 1 || currentMonth > 12) currentMonth = realMonth;
    if (isNaN(currentYear) || currentYear < 2020) currentYear = realYear;

    // SOLUÇÃO DEFINITIVA ANTI-MÊS FUTURO / ANTI-DEZEMBRO:
    // Se a URL ou rotação veio com mês > realMonth no ano corrente (ex: Dezembro em Outubro):
    // Corrige IMEDIATAMENTE para o mês corrente real e reescreve a URL no navegador.
    if (currentYear >= realYear && currentMonth > realMonth) {
        console.warn(`[CANAIS VIEW] Mês futuro ${currentMonth}/${currentYear} corrigido para mês real ${realMonth}/${realYear}`);
        currentMonth = realMonth;
        currentYear = realYear;
        if (window.history && window.history.replaceState) {
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.set('mes', currentMonth);
            cleanUrl.searchParams.set('ano', currentYear);
            window.history.replaceState({}, '', cleanUrl.toString());
        }
    }

    if (paramMes && parseInt(paramMes) === currentMonth) {
        userExplicitlyChangedMonth = true;
    }

    const monthSelect = document.getElementById('filter-month');
    const yearSelect = document.getElementById('filter-year');

    if (monthSelect) {
        monthSelect.value = currentMonth;
        monthSelect.addEventListener('change', () => {
            userExplicitlyChangedMonth = true;
        });
    }
    if (yearSelect) {
        yearSelect.value = currentYear;
        yearSelect.addEventListener('change', () => {
            userExplicitlyChangedMonth = true;
        });
    }

    const paramPeriodo = urlParams.get('periodo');
    if (paramPeriodo && ['mes', 't1', 't2', 't3', 't4', 'T1', 'T2', 'T3', 'T4'].includes(paramPeriodo)) {
        currentPeriodo = paramPeriodo.toUpperCase() === 'MES' ? 'mes' : paramPeriodo.toUpperCase();
        document.querySelectorAll('.sub-nav-canais .sub-tab-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById(`btn-periodo-${currentPeriodo.toLowerCase()}`);
        if (activeBtn) activeBtn.classList.add('active');
        if (currentPeriodo !== 'mes' && monthSelect) {
            monthSelect.disabled = true;
            monthSelect.style.opacity = '0.4';
        }
    }

    fetchData();

    setInterval(updateClock, 1000);
    updateClock();

    window.addEventListener('resize', () => {
        Object.values(chartInstances).forEach(c => c && c.resize());
    });
});
