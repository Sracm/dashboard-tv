let charts = {};
let countdownSeconds = 600;

// Atualizar o relógio a cada segundo
function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('date');
    if (clockEl) clockEl.textContent = now.toLocaleTimeString('pt-BR');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('pt-BR');
}
setInterval(updateClock, 1000);
updateClock();

function navigateTab(path) {
    pararTodosAudios();
    if (path === '/tv' || path === '/') {
        window.location.href = '/tv';
        return;
    }
    const m = document.getElementById('filter-month') ? document.getElementById('filter-month').value : '';
    const y = document.getElementById('filter-year') ? document.getElementById('filter-year').value : '';
    window.location.href = `${path}?mes=${m}&ano=${y}`;
}

// Parar qualquer áudio tocando ao sair ou trocar de página
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
}

// Função para formatar as opções do Gauge
function getGaugeOption(percent, name) {
    const isEmpresa = name && name.toUpperCase() === 'EMPRESA';
    const centerX = isEmpresa ? '50%' : '44%';

    return {
        series: [
            {
                type: 'gauge',
                startAngle: 180,
                endAngle: 0,
                min: 0,
                max: 120,
                splitNumber: 12,
                radius: '135%',
                center: [centerX, '65%'],
                axisLine: {
                    lineStyle: {
                        width: 25,
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
                    width: 10,
                    offsetCenter: [0, '-5%'],
                    itemStyle: {
                        color: '#0d6efd'
                    }
                },
                axisTick: {
                    length: 12,
                    lineStyle: {
                        color: 'auto',
                        width: 2
                    }
                },
                splitLine: {
                    length: 18,
                    lineStyle: {
                        color: 'auto',
                        width: 3
                    }
                },
                axisLabel: {
                    show: false
                },
                title: {
                    offsetCenter: [0, '25%'],
                    fontSize: 20,
                    color: '#fff'
                },
                detail: {
                    fontSize: 20,
                    offsetCenter: [0, '30%'],
                    valueAnimation: true,
                    formatter: function () {
                        return '{value|' + percent.toFixed(1) + '%}';
                    },
                    rich: {
                        value: {
                            fontSize: 20,
                            fontWeight: 'bolder',
                            color: '#0d6efd'
                        }
                    }
                },
                data: [
                    {
                        value: Math.min(Math.max(percent, 0), 120),
                        name: ''
                    }
                ]
            }
        ]
    };
}

// Mapeamento do canal para a chave de áudio
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

// Renderizar os Gráficos
function renderCharts(data, mes, ano) {
    const container = document.getElementById('gauges-container');
    if (!container) return;
    
    data.forEach((equipe, index) => {
        const chartId = `gauge-${index}`;
        
        if (!document.getElementById(chartId)) {
            const card = document.createElement('div');
            card.className = 'gauge-card';
            
            if (equipe.name.toUpperCase() === 'EMPRESA') {
                card.classList.add('empresa-card');
            }
            
            const title = document.createElement('div');
            title.className = 'gauge-title';
            title.textContent = equipe.name;
            
            const chartDiv = document.createElement('div');
            chartDiv.className = 'gauge-chart';
            chartDiv.id = chartId;
            
            const compDiv = document.createElement('div');
            compDiv.className = 'comparison-container';
            compDiv.id = `comp-${index}`;
            
            card.appendChild(title);
            card.appendChild(chartDiv);
            card.appendChild(compDiv);
            container.appendChild(card);
            
            charts[chartId] = echarts.init(chartDiv);
        }
        
        const cardElement = document.getElementById(chartId).parentElement;
        const chave = obterChaveCanal(equipe.name);
        if (equipe.percent >= 100) {
            cardElement.classList.add('meta-batida');
        } else {
            cardElement.classList.remove('meta-batida');
            if (chave) resetarMetaTocada(chave, mes, ano);
        }

        charts[chartId].setOption(getGaugeOption(equipe.percent, equipe.name));
        
        // Atualizar comparativos (Mês Ant., MoM, Ano Ant., YoY)
        const compContainer = document.getElementById(`comp-${index}`);
        if (compContainer) {
            const mom = equipe.mom || 0;
            const yoy = equipe.yoy || 0;
            const prevMonth = equipe.prev_month_percent !== undefined ? equipe.prev_month_percent : 0;
            const prevYear = equipe.prev_year_percent !== undefined ? equipe.prev_year_percent : 0;
            
            const renderTrendBadge = (label, diff) => {
                let trendIcon = '';
                let trendClass = '';
                let diffStr = '';
                
                if (diff > 0) {
                    trendIcon = '▲';
                    trendClass = 'trend-up';
                    diffStr = `+${diff.toFixed(1)}%`;
                } else if (diff < 0) {
                    trendIcon = '▼';
                    trendClass = 'trend-down';
                    diffStr = `${diff.toFixed(1)}%`;
                } else {
                    trendIcon = '➖';
                    trendClass = 'trend-neutral';
                    diffStr = `0.0%`;
                }
                
                return `<div class="comparison-badge">
                            <span class="badge-label">${label}:</span>
                            <span class="${trendClass}">${trendIcon} ${diffStr}</span>
                        </div>`;
            };

            const renderValueBadge = (label, val) => {
                const valNum = Number(val) || 0;
                let valColorClass = 'val-neutral';
                if (valNum >= 100) {
                    valColorClass = 'val-success';
                } else if (valNum >= 80) {
                    valColorClass = 'val-warning';
                } else if (valNum > 0) {
                    valColorClass = 'val-danger';
                }
                
                return `<div class="comparison-badge">
                            <span class="badge-label">${label}:</span>
                            <span class="badge-value ${valColorClass}">${valNum.toFixed(1)}%</span>
                        </div>`;
            };
            
            compContainer.innerHTML = 
                renderValueBadge('Mês Ant', prevMonth) +
                renderTrendBadge('MoM', mom) +
                renderValueBadge('Ano Ant', prevYear) +
                renderTrendBadge('YoY', yoy);
        }
    });

    // Classificação dos canais que atingiram a meta (ranking ordenado por percentual decrescente)
    const equipesBatidas = data
        .filter(eq => eq.percent >= 100)
        .sort((a, b) => b.percent - a.percent);

    equipesBatidas.forEach(equipe => {
        const chave = obterChaveCanal(equipe.name);
        if (chave && !jaTocouMeta(chave, mes, ano)) {
            marcarMetaComoTocada(chave, mes, ano);
            enfileirarAudio(chave);
        }
    });
}

let estadoAnterior = {};

function verificarOscilacao(data, mes, ano) {
    if (Object.keys(estadoAnterior).length === 0) {
        data.forEach((equipe, index) => {
            const chave = obterChaveCanal(equipe.name) || `canal_${index}`;
            estadoAnterior[chave] = equipe.percent || 0;
        });
        return;
    }

    let tocouSomPositivo = false;
    let tocouSomNegativo = false;

    data.forEach((equipe, index) => {
        const chave = obterChaveCanal(equipe.name) || `canal_${index}`;
        const chartId = `gauge-${index}`;
        const cardElement = document.getElementById(chartId)?.parentElement;
        
        if (!cardElement) return;

        const percentAtual = equipe.percent || 0;
        const percentAntigo = estadoAnterior[chave];

        if (percentAntigo !== undefined) {
            if (percentAtual > percentAntigo + 0.05) {
                cardElement.classList.add('oscilou-cima');
                setTimeout(() => cardElement.classList.remove('oscilou-cima'), 6000);
                
                if (!tocouSomPositivo && !tocouSomNegativo) {
                    tocouSomPositivo = true;
                    enfileirarAudioFrente('caixa');
                }
            } else if (percentAtual < percentAntigo - 0.05) {
                cardElement.classList.add('oscilou-baixo');
                setTimeout(() => cardElement.classList.remove('oscilou-baixo'), 6000);
                
                if (!tocouSomNegativo) {
                    if (tocouSomPositivo) {
                        const idx = audioQueue.indexOf('caixa');
                        if (idx > -1) audioQueue.splice(idx, 1);
                        tocouSomPositivo = false;
                    }
                    tocouSomNegativo = true;
                    enfileirarAudioFrente('policia');
                }
                
                // Desmarcar meta se caiu abaixo de 100
                if (percentAtual < 100 && percentAntigo >= 100 && chave) {
                    resetarMetaTocada(chave, mes, ano);
                    console.log(`[Meta] Canal ${chave} rebaixado para menos de 100%. Meta desmarcada.`);
                }
            }
        }
        
        estadoAnterior[chave] = percentAtual;
    });
}

let lastPeriodLoaded = '';

// Buscar dados da API
async function fetchData() {
    try {
        const month = document.getElementById('filter-month').value;
        const year = document.getElementById('filter-year').value;
        
        const currentPeriod = `${month}_${year}`;
        if (lastPeriodLoaded && lastPeriodLoaded !== currentPeriod) {
            pararTodosAudios();
            estadoAnterior = {}; // Limpar estado ao mudar de período
        }
        lastPeriodLoaded = currentPeriod;
        
        const url = `/api/vendas_tv?mes=${month}&ano=${year}`;
        const response = await fetch(url);
        const json = await response.json();
        
        if (json.success) {
            window.currentVendasData = json.data;
            verificarOscilacao(json.data, month, year);
            renderCharts(json.data, month, year);
            
            // Atualizar data de última atualização
            const now = new Date();
            const timeString = now.toLocaleTimeString('pt-BR');
            const lastUpdateEl = document.getElementById('last-update');
            if (lastUpdateEl) {
                lastUpdateEl.textContent = `Última atualização: ${timeString}`;
            }
            
            // Resetar timer
            countdownSeconds = 600; // 10 minutos
            updateCountdownDisplay();
        } else {
            console.error("Erro na API:", json.error);
        }
    } catch (error) {
        console.error("Erro ao buscar dados:", error);
    }
}

// Desbloquear permissão de reprodução de áudio no navegador
function desbloquearAudiosNavegador() {
    const allAudioIds = [
        'victory-sound', 'music-sound', 'audio-distribuicao',
        'audio-ecommerce', 'audio-comex', 'audio-varejo-sp',
        'audio-varejo-reg', 'audio-parlux', 'audio-caixa', 'audio-policia'
    ];
    allAudioIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const origVol = el.volume;
            el.volume = 0;
            const p = el.play();
            if (p) {
                p.then(() => {
                    el.pause();
                    el.currentTime = 0;
                    el.volume = origVol || 1.0;
                }).catch(() => {});
            }
        }
    });
}
document.addEventListener('click', desbloquearAudiosNavegador, { once: true });

// Atualização manual pelo botão
async function manualRefresh() {
    desbloquearAudiosNavegador();
    pararTodosAudios();
    const month = document.getElementById('filter-month').value;
    const year = document.getElementById('filter-year').value;
    
    const btn = document.getElementById('btn-refresh');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Atualizando...';
    }
    await fetchData();
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '🔄 Atualizar';
    }
}

// Inicializar combos: na guia mensal, SEMPRE deixar o mês atual e ano atual
function initFilters() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // Sempre o mês atual na guia mensal
    const currentYear = now.getFullYear();   // Sempre o ano atual na guia mensal
    
    const monthSelect = document.getElementById('filter-month');
    const yearSelect = document.getElementById('filter-year');
    
    if (monthSelect) {
        monthSelect.value = currentMonth;
        monthSelect.addEventListener('change', () => {
            pararTodosAudios();
        });
    }
    if (yearSelect) {
        yearSelect.value = currentYear;
        yearSelect.addEventListener('change', () => {
            pararTodosAudios();
        });
    }
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
    'sirene':       { id: 'victory-sound',      duration: 10000, nome: 'Sirene de Vitória' },
    'caixa':        { id: 'audio-caixa',        duration: 4000,  nome: 'Caixa Registradora' },
    'policia':      { id: 'audio-policia',      duration: 7000,  nome: 'Sirene de Polícia' }
};

let audioQueue = [];
let audioQueueRunning = false;
let currentAudioTimeout = null;
let currentAudioElement = null;
let intervalCountdownTimer = null;
let finalizarAudioCallback = null;
let totalMusicasNaFila = 0;
let musicaAtualIndex = 0;

// Atualização do badge visual de status de áudio
function mostrarStatusAudio(html, borderColor = '#0dcaf0', bgColor = 'rgba(13, 202, 240, 0.15)') {
    const badge = document.getElementById('audio-status-badge');
    if (badge) {
        badge.innerHTML = html;
        badge.style.display = 'inline-flex';
        badge.style.borderColor = borderColor;
        badge.style.background = bgColor;
    }
}

function esconderStatusAudio() {
    const badge = document.getElementById('audio-status-badge');
    if (badge) {
        badge.style.display = 'none';
        badge.innerHTML = '';
    }
}

let audioIsPaused = false;

function pausarOuRetomarAudio() {
    const btn = document.getElementById('btn-pausar-audio');
    
    // Se temos um elemento de áudio ativo
    if (currentAudioElement) {
        if (!currentAudioElement.paused) {
            currentAudioElement.pause();
            audioIsPaused = true;
            if (btn) {
                btn.innerHTML = '▶️ Retomar Música';
                btn.classList.add('paused');
            }
            mostrarStatusAudio('⏸️ Música Pausada', '#ffc107', 'rgba(255, 193, 7, 0.2)');
        } else {
            currentAudioElement.play().catch(() => {});
            audioIsPaused = false;
            if (btn) {
                btn.innerHTML = '⏸️ Pausar Música';
                btn.classList.remove('paused');
            }
        }
        return;
    }

    // Caso não esteja em currentAudioElement, verifica se há algum áudio tocando no DOM
    const allAudioIds = [
        'victory-sound', 'music-sound', 'audio-distribuicao',
        'audio-ecommerce', 'audio-comex', 'audio-varejo-sp',
        'audio-varejo-reg', 'audio-parlux'
    ];
    let encontrado = false;
    for (const id of allAudioIds) {
        const el = document.getElementById(id);
        if (el && !el.paused && el.currentTime > 0) {
            currentAudioElement = el;
            el.pause();
            audioIsPaused = true;
            encontrado = true;
            break;
        }
    }

    if (encontrado) {
        if (btn) {
            btn.innerHTML = '▶️ Retomar Música';
            btn.classList.add('paused');
        }
        mostrarStatusAudio('⏸️ Música Pausada', '#ffc107', 'rgba(255, 193, 7, 0.2)');
    } else if (audioIsPaused && currentAudioElement) {
        currentAudioElement.play().catch(() => {});
        audioIsPaused = false;
        if (btn) {
            btn.innerHTML = '⏸️ Pausar Música';
            btn.classList.remove('paused');
        }
    }
}

function pararTodosAudios() {
    audioQueue = [];
    audioQueueRunning = false;
    totalMusicasNaFila = 0;
    musicaAtualIndex = 0;
    audioIsPaused = false;

    const btnPausar = document.getElementById('btn-pausar-audio');
    if (btnPausar) {
        btnPausar.innerHTML = '⏸️ Pausar Música';
        btnPausar.classList.remove('paused');
    }

    if (intervalCountdownTimer) {
        clearInterval(intervalCountdownTimer);
        intervalCountdownTimer = null;
    }

    if (currentAudioTimeout) {
        clearTimeout(currentAudioTimeout);
        currentAudioTimeout = null;
    }

    if (currentAudioElement) {
        currentAudioElement.onended = null;
        currentAudioElement = null;
    }
    finalizarAudioCallback = null;

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

    esconderStatusAudio();
}

function pularParaProximoAudio() {
    // Se estiver em intervalo (esperando 20 segundos)
    if (intervalCountdownTimer) {
        clearInterval(intervalCountdownTimer);
        intervalCountdownTimer = null;
        if (currentAudioTimeout) {
            clearTimeout(currentAudioTimeout);
            currentAudioTimeout = null;
        }
        console.log('[Áudio Fila] Intervalo de 20s pulado manualmente.');
        processarFilaAudios();
        return;
    }

    // Se estiver tocando uma música no momento
    if (finalizarAudioCallback) {
        console.log('[Áudio Fila] Música pulada manualmente.');
        finalizarAudioCallback();
    }
}

function enfileirarAudio(tipo) {
    if (!AUDIO_CONFIG[tipo]) return;

    // Evita duplicar se já estiver na fila
    if (audioQueue.includes(tipo)) return;

    audioQueue.push(tipo);
    if (!audioQueueRunning) {
        totalMusicasNaFila = audioQueue.length;
        musicaAtualIndex = 0;
    } else {
        totalMusicasNaFila++;
    }
    console.log(`[Áudio Fila] Adicionado à fila: ${AUDIO_CONFIG[tipo].nome}. Fila:`, audioQueue);

    if (!audioQueueRunning && !intervalCountdownTimer) {
        processarFilaAudios();
    }
}

function enfileirarAudioFrente(tipo) {
    if (!AUDIO_CONFIG[tipo]) return;

    if (audioQueue.includes(tipo)) return;

    audioQueue.unshift(tipo);
    if (!audioQueueRunning) {
        totalMusicasNaFila = audioQueue.length;
        musicaAtualIndex = 0;
    } else {
        totalMusicasNaFila++;
    }
    console.log(`[Áudio Fila] Adicionado à frente da fila: ${AUDIO_CONFIG[tipo].nome}. Fila:`, audioQueue);

    if (!audioQueueRunning && !intervalCountdownTimer) {
        processarFilaAudios();
    }
}

function processarFilaAudios() {
    if (audioQueueRunning) return;
    if (audioQueue.length === 0) {
        console.log('[Áudio Fila] Fila finalizada.');
        mostrarStatusAudio('✅ Todas as músicas foram concluídas!', '#28a745', 'rgba(40, 167, 69, 0.2)');
        setTimeout(() => {
            if (!audioQueueRunning && audioQueue.length === 0) {
                esconderStatusAudio();
            }
        }, 6000);
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
    musicaAtualIndex++;

    // Pausa outros áudios para garantir zero sobreposição
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

    const progressoTexto = totalMusicasNaFila > 1 ? `[${musicaAtualIndex}/${totalMusicasNaFila}] ` : '';
    mostrarStatusAudio(`🎵 ${progressoTexto}Tocando: <strong>${config.nome}</strong>`, '#0d6efd', 'rgba(13, 110, 253, 0.2)');

    let finalizado = false;
    const finalizarAudio = () => {
        if (finalizado) return;
        finalizado = true;
        finalizarAudioCallback = null;

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
            const proximoCanal = audioQueue[0];
            const proxConfig = AUDIO_CONFIG[proximoCanal];
            const proxNome = proxConfig ? proxConfig.nome.split('(')[0].trim() : proximoCanal;
            
            const isCurto = (config.id === 'audio-caixa' || config.id === 'audio-policia');
            let segundosRestantes = isCurto ? 0 : 20;
            console.log(`[Áudio Fila] Finalizado: ${config.nome}. Aguardando ${segundosRestantes} segundos de intervalo antes da próxima música. Restantes na fila: ${audioQueue.length}`);
            
            mostrarStatusAudio(`⏳ Intervalo: <strong>${segundosRestantes}s</strong> (Próxima: ${proxNome})`, '#ffc107', 'rgba(255, 193, 7, 0.2)');
            
            if (intervalCountdownTimer) clearInterval(intervalCountdownTimer);
            if (segundosRestantes > 0) {
                intervalCountdownTimer = setInterval(() => {
                    segundosRestantes--;
                    if (segundosRestantes > 0) {
                        mostrarStatusAudio(`⏳ Intervalo: <strong>${segundosRestantes}s</strong> (Próxima: ${proxNome})`, '#ffc107', 'rgba(255, 193, 7, 0.2)');
                    } else {
                        clearInterval(intervalCountdownTimer);
                        intervalCountdownTimer = null;
                    }
                }, 1000);
            }
            
            const msEspera = isCurto ? 500 : 20000;
            currentAudioTimeout = setTimeout(() => {
                currentAudioTimeout = null;
                if (intervalCountdownTimer) {
                    clearInterval(intervalCountdownTimer);
                    intervalCountdownTimer = null;
                }
                processarFilaAudios();
            }, msEspera);
        } else {
            console.log(`[Áudio Fila] Finalizado: ${config.nome}. Todas as músicas da fila foram concluídas.`);
            mostrarStatusAudio('✅ Sequência de Metas Concluída com Sucesso!', '#28a745', 'rgba(40, 167, 69, 0.2)');
            setTimeout(() => {
                if (!audioQueueRunning && audioQueue.length === 0) {
                    esconderStatusAudio();
                }
            }, 6000);
        }
    };

    finalizarAudioCallback = finalizarAudio;
    audioEl.onended = finalizarAudio;

    console.log(`[Áudio Fila] 🎵 Tocando: ${config.nome} (${config.duration / 1000}s)`);
    audioEl.play().then(() => {
        currentAudioTimeout = setTimeout(finalizarAudio, config.duration);
    }).catch(e => {
        console.warn(`Erro ao tocar áudio ${config.nome}:`, e);
        finalizarAudio();
    });
}

function desbloquearAudiosNavegador() {
    const allAudioIds = [
        'victory-sound', 'music-sound', 'audio-distribuicao',
        'audio-ecommerce', 'audio-comex', 'audio-varejo-sp',
        'audio-varejo-reg', 'audio-parlux', 'audio-caixa', 'audio-policia'
    ];
    allAudioIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.play().then(() => {
                el.pause();
                el.currentTime = 0;
            }).catch(() => {});
        }
    });
}

// Testar a sequência completa de metas atingidas
function testarSequenciaMetas() {
    desbloquearAudiosNavegador();
    pararTodosAudios();

    let canaisParaTestar = [];

    if (window.currentVendasData && Array.isArray(window.currentVendasData)) {
        // Ordena por percentual decrescente (classificação de quem bateu meta)
        const metasBatidas = window.currentVendasData
            .filter(eq => eq.percent >= 100)
            .sort((a, b) => b.percent - a.percent);

        canaisParaTestar = metasBatidas
            .map(eq => obterChaveCanal(eq.name))
            .filter(chave => chave && AUDIO_CONFIG[chave]);
    }

    // Se nenhum canal tiver batido a meta no mês filtrado, usa o exemplo de Agosto
    if (canaisParaTestar.length === 0) {
        console.log('[Teste] Usando sequência padrão das metas de Agosto: Distribuição, Varejo SP, E-commerce, Empresa.');
        canaisParaTestar = ['distribuicao', 'varejo_sp', 'ecommerce', 'empresa'];
    }

    console.log('[Teste Sequência Metas] Ordem de reprodução (Classificação):', canaisParaTestar);

    audioQueue = [...canaisParaTestar];
    totalMusicasNaFila = audioQueue.length;
    musicaAtualIndex = 0;

    processarFilaAudios();
}

// Testar individualmente uma música
function testarAudioIndividual(tipo) {
    pararTodosAudios();
    fecharAudioDropdown();

    if (tipo && AUDIO_CONFIG[tipo]) {
        audioQueue = [tipo];
        totalMusicasNaFila = 1;
        musicaAtualIndex = 0;
        processarFilaAudios();
    } else {
        enfileirarAudio('sirene');
    }
}

function testarAudio(tipo) {
    testarAudioIndividual(tipo);
}

// Dropdown de Músicas
function toggleAudioDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('audio-dropdown-menu');
    if (menu) {
        menu.classList.toggle('show');
    }
}

function fecharAudioDropdown() {
    const menu = document.getElementById('audio-dropdown-menu');
    if (menu && menu.classList.contains('show')) {
        menu.classList.remove('show');
    }
}

document.addEventListener('click', (e) => {
    const container = document.querySelector('.audio-dropdown-container');
    if (container && !container.contains(e.target)) {
        fecharAudioDropdown();
    }
});

function tocarAudioDistribuicao() { enfileirarAudio('distribuicao'); }
function tocarAudioEcommerce() { enfileirarAudio('ecommerce'); }
function tocarAudioComex() { enfileirarAudio('comex'); }
function tocarAudioVarejoSp() { enfileirarAudio('varejo_sp'); }
function tocarAudioVarejoReg() { enfileirarAudio('varejo_reg'); }
function tocarAudioMetaEmpresa() { enfileirarAudio('empresa'); }
function tocarAudioParlux() { enfileirarAudio('parlux'); }

// Lógica do cronômetro
function updateCountdownDisplay() {
    const minutes = Math.floor(countdownSeconds / 60);
    const seconds = countdownSeconds % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const nextUpdateEl = document.getElementById('next-update');
    if (nextUpdateEl) {
        nextUpdateEl.textContent = `Próxima atualização em: ${timeStr}`;
    }
}

// Buscar logo que carregar a página
document.addEventListener("DOMContentLoaded", () => {
    initFilters();
    fetchData();
    
    // Timer para atualização periódica
    setInterval(() => {
        if (countdownSeconds > 0) {
            countdownSeconds--;
            updateCountdownDisplay();
        } else {
            countdownSeconds = 600;
            fetchData();
        }
    }, 1000);
});

// Responsividade
window.addEventListener('resize', function() {
    Object.values(charts).forEach(chart => {
        chart.resize();
    });
});
