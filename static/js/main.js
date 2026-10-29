// Purga estado antigo contaminado onde Varejo Reg sobrescrevia Varejo SP
const TV_STORAGE_SCHEMA_VERSION = 'v2_varejo_split';
try {
    if (localStorage.getItem('tv_storage_version') !== TV_STORAGE_SCHEMA_VERSION) {
        localStorage.removeItem('tv_estado_anterior_mes_atual');
        localStorage.removeItem('tv_alerta_oscilacao_pendente');
        localStorage.setItem('tv_storage_version', TV_STORAGE_SCHEMA_VERSION);
    }
} catch (e) {}

let charts = {};
let countdownSeconds = 600;
let ultimosPercentuaisCanais = {};
let isFirstDataLoad = true;

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

// Sistema de Marcos / Supermetas:
// Empresa: 100% e 105% (toca Van Halen novamente ao bater 105%)
// Distribuição: 100% e 170% (toca Black Sabbath novamente ao bater 170%)
// Demais canais: 100% (padrão)
const MARCOS_METAS = {
    'empresa': [100, 105],
    'distribuicao': [100, 170]
};

function obterMarcosCanal(chave) {
    return MARCOS_METAS[chave] || [100];
}

function jaTocouMarco(chave, marco, mes, ano) {
    try {
        const k = `meta_marco_tocado_${chave}_${marco}_${mes}_${ano}`;
        return localStorage.getItem(k) === 'true';
    } catch (e) {
        return false;
    }
}

function marcarMarcoComoTocado(chave, marco, mes, ano) {
    try {
        const k = `meta_marco_tocado_${chave}_${marco}_${mes}_${ano}`;
        localStorage.setItem(k, 'true');
        if (marco === 100) {
            localStorage.setItem(`meta_som_tocada_${chave}_${mes}_${ano}`, 'true');
        }
    } catch (e) {}
}

function resetarMarcoTocado(chave, marco, mes, ano) {
    try {
        localStorage.removeItem(`meta_marco_tocado_${chave}_${marco}_${mes}_${ano}`);
        if (marco === 100) {
            localStorage.removeItem(`meta_som_tocada_${chave}_${mes}_${ano}`);
        }
    } catch (e) {}
}

function jaTocouMeta(chave, mes, ano) {
    return jaTocouMarco(chave, 100, mes, ano);
}

function marcarMetaComoTocada(chave, mes, ano) {
    marcarMarcoComoTocado(chave, 100, mes, ano);
}

function resetarMetaTocada(chave, mes, ano) {
    resetarMarcoTocado(chave, 100, mes, ano);
}

function resetarTodasMetasTocadasDoMes(mes, ano) {
    try {
        const chaves = ['parlux', 'empresa', 'distribuicao', 'ecommerce', 'comex', 'varejo_sp', 'varejo_reg'];
        chaves.forEach(k => {
            localStorage.removeItem(`meta_som_tocada_${k}_${mes}_${ano}`);
            sessionStorage.removeItem(`meta_som_tocada_${k}_${mes}_${ano}`);
            const marcos = obterMarcosCanal(k);
            marcos.forEach(m => {
                localStorage.removeItem(`meta_marco_tocado_${k}_${m}_${mes}_${ano}`);
                sessionStorage.removeItem(`meta_marco_tocado_${k}_${m}_${mes}_${ano}`);
            });
        });
    } catch (e) {}
}

function formatarTextoBadgeObjetivo(chave, percent, isEmpresa) {
    const p = Number(percent) || 0;
    if (chave === 'empresa' || isEmpresa) {
        if (p >= 105) return 'OBJETIVO ALCANÇADO — 105% SUPERADO!';
        return 'OBJETIVO ALCANÇADO — META SUPERADA!';
    }
    if (chave === 'distribuicao') {
        if (p >= 170) return 'OBJETIVO ALCANÇADO — 170% SUPERADO!';
        return 'OBJETIVO ALCANÇADO!!!';
    }
    return 'OBJETIVO ALCANÇADO!!!';
}

// Função para formatar as opções do Gauge
function getGaugeOption(percent, name) {
    const isEmpresa = name && name.toUpperCase() === 'EMPRESA';
    const centerX = '50%';

    return {
        series: [
            {
                type: 'gauge',
                startAngle: 180,
                endAngle: 0,
                min: 0,
                max: 120,
                splitNumber: 12,
                radius: isEmpresa ? '120%' : '135%',
                center: [centerX, isEmpresa ? '72%' : '66%'],
                axisLine: {
                    lineStyle: {
                        width: isEmpresa ? 24 : 18,
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
                    width: isEmpresa ? 9 : 7,
                    offsetCenter: [0, '-4%'],
                    itemStyle: {
                        color: '#f5c518',
                        shadowColor: 'rgba(0, 0, 0, 0.6)',
                        shadowBlur: 4
                    }
                },
                axisTick: {
                    length: 6,
                    lineStyle: {
                        color: 'auto',
                        width: 1.2
                    }
                },
                splitLine: {
                    length: 12,
                    lineStyle: {
                        color: 'auto',
                        width: 2
                    }
                },
                axisLabel: {
                    show: false
                },
                title: {
                    show: false
                },
                detail: {
                    fontSize: isEmpresa ? 24 : 19,
                    offsetCenter: [0, '20%'],
                    valueAnimation: true,
                    formatter: function () {
                        return '{value|' + percent.toFixed(1) + '%}';
                    },
                    rich: {
                        value: {
                            fontSize: isEmpresa ? 24 : 19,
                            fontWeight: '800',
                            color: '#ffffff',
                            fontFamily: 'Montserrat'
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
    if (eqName.includes('VAREJO')) {
        if (eqName.includes('REG')) return 'varejo_reg';
        if (/\bSP\b/.test(eqName) || eqName.includes('- SP') || eqName.endsWith(' SP')) return 'varejo_sp';
        return 'varejo_sp';
    }
    return null;
}

// ---------------------------------------------------------------------------
// Indicadores de tempo exibidos dentro de cada velocímetro
// ---------------------------------------------------------------------------

// null/undefined = não há base de comparação no período anterior.
// Nunca exibir 0% ou +100% nesse caso: seria um número inventado.
function formatarVariacao(valor) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) {
        return { texto: '—', icone: '', classe: 'trend-neutral' };
    }
    const v = Number(valor);
    if (v > 0) return { texto: `+${v.toFixed(1)}%`, icone: '▲', classe: 'trend-up' };
    if (v < 0) return { texto: `${v.toFixed(1)}%`, icone: '▼', classe: 'trend-down' };
    return { texto: '0,0%', icone: '➖', classe: 'trend-neutral' };
}

function formatarMoedaCompacta(valor) {
    const v = Number(valor) || 0;
    const sinal = v < 0 ? '-' : '';
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${sinal}R$ ${(abs / 1e6).toFixed(1).replace('.', ',')} mi`;
    if (abs >= 1e3) return `${sinal}R$ ${(abs / 1e3).toFixed(0)} mil`;
    return `${sinal}R$ ${abs.toFixed(0)}`;
}

function formatarPercentualMeta(valor) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) {
        return '<span class="trend-neutral">—</span>';
    }
    const v = Number(valor);
    let classe = 'val-danger';
    if (v >= 100) classe = 'val-success';
    else if (v >= 80) classe = 'val-warning';
    return `<span class="badge-value ${classe}">${v.toFixed(1)}%</span>`;
}

function formatarDataCurta(iso) {
    if (!iso) return '';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}`;
}

function renderTabelaIndicadores(equipe, contexto) {
    const linha = (rotulo, conteudo, subvalor, titulo) => `
        <tr title="${titulo || ''}">
            <th class="kpi-rotulo">${rotulo}</th>
            <td class="kpi-valor">
                <span class="kpi-pct-box">${conteudo}</span>
                ${subvalor ? `<span class="kpi-subvalor">${subvalor}</span>` : ''}
            </td>
        </tr>`;

    const variacao = (valor) => {
        const f = formatarVariacao(valor);
        return `<span class="${f.classe}">${f.icone} ${f.texto}</span>`;
    };

    const p = (contexto && contexto.periodos) || {};
    const intervalo = (chave) => {
        const per = p[chave];
        return per ? `${formatarDataCurta(per[0])} a ${formatarDataCurta(per[1])}` : '';
    };

    const cabecalho = contexto
        ? `<caption class="kpi-caption">até ${formatarDataCurta(contexto.corte)}` +
          `${contexto.parcial ? ` · ${contexto.dias} dias` : ' · mês fechado'}</caption>`
        : '';

    const momSub = `${formatarMoedaCompacta(equipe.mtd)} vs ${formatarMoedaCompacta(equipe.mes_anterior)}`;
    const yoySub = `${formatarMoedaCompacta(equipe.mtd)} vs ${formatarMoedaCompacta(equipe.mes_ano_anterior)}`;
    const ytdSub = `${formatarMoedaCompacta(equipe.ytd)} vs ${formatarMoedaCompacta(equipe.ytd_anterior)}`;

    return `<table class="kpi-table">
        ${cabecalho}
        <tbody>
            ${linha('MoM', variacao(equipe.mom), null, `${intervalo('mtd')} (${formatarMoedaCompacta(equipe.mtd)}) vs ${intervalo('mes_anterior')} (${formatarMoedaCompacta(equipe.mes_anterior)})`)}
            ${linha('YoY', variacao(equipe.yoy), null, `${intervalo('mtd')} (${formatarMoedaCompacta(equipe.mtd)}) vs ${intervalo('mes_ano_anterior')} (${formatarMoedaCompacta(equipe.mes_ano_anterior)})`)}
            ${linha('YTD', variacao(equipe.ytd_yoy), null, `Receita acumulada: ${intervalo('ytd')} (${formatarMoedaCompacta(equipe.ytd)}) vs ${intervalo('ytd_anterior')} (${formatarMoedaCompacta(equipe.ytd_anterior)})`)}
        </tbody>
    </table>`;
}

// Renderizar os Gráficos
function renderCharts(data, mes, ano, contexto) {
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
            
            const chave = obterChaveCanal(equipe.name);
            card.dataset.canal = chave || `canal_${index}`;
            card.id = `card-${chave || index}`;
            
            const title = document.createElement('div');
            title.className = 'gauge-title';
            title.textContent = equipe.name;
            
            const badgeObjetivo = document.createElement('div');
            badgeObjetivo.className = 'badge-objetivo-alcancado';
            badgeObjetivo.innerHTML = formatarTextoBadgeObjetivo(chave, equipe.percent, equipe.name.toUpperCase() === 'EMPRESA');
            
            const chartDiv = document.createElement('div');
            chartDiv.className = 'gauge-chart';
            chartDiv.id = chartId;
            
            const compDiv = document.createElement('div');
            compDiv.className = 'comparison-container';
            compDiv.id = `comp-${index}`;
            
            card.appendChild(title);
            card.appendChild(badgeObjetivo);
            

            card.appendChild(chartDiv);
            card.appendChild(compDiv);
            container.appendChild(card);
            
            charts[chartId] = echarts.init(chartDiv);
        }
        
        const cardElement = document.getElementById(chartId).parentElement;
        const chave = obterChaveCanal(equipe.name);

        // Garante que o badge exista no card mesmo em atualizações subsequentes
        let badgeEl = cardElement.querySelector('.badge-objetivo-alcancado');
        if (!badgeEl) {
            badgeEl = document.createElement('div');
            badgeEl.className = 'badge-objetivo-alcancado';
            badgeEl.innerHTML = formatarTextoBadgeObjetivo(chave, equipe.percent, equipe.name.toUpperCase() === 'EMPRESA');
            const titleEl = cardElement.querySelector('.gauge-title');
            if (titleEl && titleEl.nextSibling) {
                cardElement.insertBefore(badgeEl, titleEl.nextSibling);
            } else {
                cardElement.prepend(badgeEl);
            }
        }

        if (equipe.percent >= 100) {
            cardElement.classList.add('meta-batida');
        } else {
            cardElement.classList.remove('meta-batida');
        }

        charts[chartId].setOption(getGaugeOption(equipe.percent, equipe.name));
        
        // Tabela de indicadores de tempo (MoM, YoY, YTD) dentro do velocímetro.
        // Todos os percentuais vêm prontos do backend, onde os períodos já foram
        // recortados em intervalos equivalentes — o JS apenas formata.
        const compContainer = document.getElementById(`comp-${index}`);
        if (compContainer) {
            compContainer.innerHTML = renderTabelaIndicadores(equipe, contexto);
            charts[chartId].resize();
        }
    });

    // REGRA DE OURO: A música da meta toca APENAS UMA VEZ no momento em que a meta for ATINGIDA (< 100% -> >= 100%).
    // 1. Na abertura do dashboard (primeira carga): NÃO toca músicas de metas que já estavam batidas antes de abrir a página.
    //    Memoriza os percentuais e garante que canais já batidos fiquem marcados no localStorage.
    // 2. Em atualizações subsequentes (polling de 10 min, refresh ou alerta de oscilação):
    //    Se um canal estava < 100% e cruza para >= 100%, toca o áudio de comemoração UMA ÚNICA VEZ.
    if (isFirstDataLoad) {
        data.forEach(equipe => {
            const chave = obterChaveCanal(equipe.name);
            if (chave) {
                const p = Number(equipe.percent) || 0;
                ultimosPercentuaisCanais[chave] = p;
                const marcos = obterMarcosCanal(chave);
                marcos.forEach(marco => {
                    if (p >= marco) {
                        marcarMarcoComoTocado(chave, marco, mes, ano);
                    }
                });
            }
        });
        isFirstDataLoad = false;
        console.log('[TV Áudio Metas] Carga inicial: baseline e marcos memorizados.');
    } else {
        const canaisRecemBatidos = [];

        data.forEach(equipe => {
            const chave = obterChaveCanal(equipe.name);
            if (chave) {
                const pAnt = ultimosPercentuaisCanais[chave];
                const pAtual = Number(equipe.percent) || 0;
                const marcos = obterMarcosCanal(chave);

                if (pAnt !== undefined) {
                    marcos.forEach(marco => {
                        // Cruza o marco agora (estava abaixo do marco e agora atingiu ou superou >= marco)
                        if (pAnt < marco && pAtual >= marco && !jaTocouMarco(chave, marco, mes, ano)) {
                            console.log(`[TV Áudio Metas] 🎉 MARCO ${marco}% ATINGIDO AGORA: ${equipe.name} (${pAnt.toFixed(1)}% -> ${pAtual.toFixed(1)}%)!`);
                            canaisRecemBatidos.push({ chave, marco, percent: pAtual, name: equipe.name });
                            marcarMarcoComoTocado(chave, marco, mes, ano);
                        }
                    });
                }

                ultimosPercentuaisCanais[chave] = pAtual;
            }
        });

        canaisRecemBatidos.sort((a, b) => {
            // REGRA MQ: Se Empresa e Canal atingiram meta, o Canal toca PRIMEIRO e a Empresa toca por ÚLTIMO
            if (a.chave === 'empresa' && b.chave !== 'empresa') return 1;
            if (b.chave === 'empresa' && a.chave !== 'empresa') return -1;
            return b.percent - a.percent;
        });

        canaisRecemBatidos.forEach(item => {
            const labelMarco = item.marco > 100 ? ` (Supermeta ${item.marco}%)` : '';
            console.log(`[TV Áudio Metas] 🎉 Enfileirando música para ${item.name}${labelMarco}`);
            mostrarStatusAudio(`🎉 ${item.name} bateu ${item.marco}% de Meta! Tocando comemoração...`, '#28a745', 'rgba(40, 167, 69, 0.25)');
            enfileirarAudio(item.chave);
        });
    }
}

let estadoAnterior = {};

// Processa alertas de oscilação gravados no localStorage por outras abas
function processarAlertaPendente() {
    let alerta = null;
    try {
        const raw = localStorage.getItem('tv_alerta_oscilacao_pendente');
        if (raw) alerta = JSON.parse(raw);
    } catch(e) {}

    if (!alerta || !alerta.tipo) return;

    // Se o alerta tiver mais de 2 minutos, descarta
    if (alerta.timestamp && (Date.now() - alerta.timestamp > 120000)) {
        localStorage.removeItem('tv_alerta_oscilacao_pendente');
        return;
    }

    console.log('[Alerta TV] 🚨 Processando alerta de oscilação pendente:', alerta);

    const canais = (alerta.canais && alerta.canais.length > 0)
        ? alerta.canais
        : [];

    canais.forEach(item => {
        const cardEl = document.querySelector(`[data-canal="${item.canal}"]`) || 
                       document.getElementById(`card-${item.canal}`);
        if (cardEl) {
            const cls = item.tipo === 'cima' ? 'oscilou-cima' : 'oscilou-baixo';
            cardEl.classList.remove('oscilou-cima', 'oscilou-baixo');
            cardEl.classList.add(cls);
            // Permanece piscando continuamente até a próxima atualização
        }
    });

    if (alerta.tipo === 'cima') {
        enfileirarAudioFrente('caixa');
    } else if (alerta.tipo === 'baixo') {
        enfileirarAudioFrente('policia');
    }

    // Limpa o alerta pendente para não repetir
    localStorage.removeItem('tv_alerta_oscilacao_pendente');
}
window.dispararAlertaOscilacaoPendente = processarAlertaPendente;

// Simulador para testes rápidos da TV
window.simularOscilacaoTV = function(tipo = 'cima', canal = 'distribuicao') {
    pararTodosAudios();
    desbloquearAudiosNavegador();
    console.log(`[TESTE TV] Simulando oscilação ${tipo} no canal ${canal}...`);
    localStorage.setItem('tv_alerta_oscilacao_pendente', JSON.stringify({
        tipo: tipo,
        canais: [{ canal: canal, tipo: tipo, nome: canal.toUpperCase() }],
        timestamp: Date.now()
    }));
    processarAlertaPendente();
};

function verificarOscilacao(data, mes, ano) {
    const now = new Date();
    const mesAtual = now.getMonth() + 1;
    const anoAtual = now.getFullYear();

    // A regra da TV estipula que a monitoração de oscilação ocorre sempre no MÊS ATUAL
    const isMesAtual = (parseInt(mes) === mesAtual && parseInt(ano) === anoAtual);
    if (!isMesAtual) {
        document.querySelectorAll('.gauge-card, .empresa-card').forEach(el => {
            el.classList.remove('oscilou-cima', 'oscilou-baixo');
        });
        return;
    }

    let estadoSalvo = {};
    try {
        estadoSalvo = JSON.parse(localStorage.getItem('tv_estado_anterior_mes_atual') || '{}');
    } catch (e) {
        estadoSalvo = {};
    }

    if (isFirstDataLoad || Object.keys(estadoSalvo).length === 0) {
        const inicial = {};
        data.forEach((equipe, index) => {
            const chave = obterChaveCanal(equipe.name) || `canal_${index}`;
            inicial[chave] = {
                percent: Number(equipe.percent) || 0,
                realizado: Number(equipe.realizado) || 0,
                meta: Number(equipe.meta) || 0
            };
        });
        localStorage.setItem('tv_estado_anterior_mes_atual', JSON.stringify(inicial));
        return;
    }

    let tocouSomPositivo = false;
    let tocouSomNegativo = false;
    const novoEstado = { ...estadoSalvo };

    data.forEach((equipe, index) => {
        const chave = obterChaveCanal(equipe.name) || `canal_${index}`;
        const cardElement = document.querySelector(`[data-canal="${chave}"]`) || 
                            document.getElementById(`card-${chave}`) || 
                            document.getElementById(`gauge-${index}`)?.parentElement;
        
        const percentAtual = Number(equipe.percent) || 0;
        const realizadoAtual = Number(equipe.realizado) || 0;
        const metaAtual = Number(equipe.meta) || 0;
        const anterior = estadoSalvo[chave];

        if (anterior !== undefined) {
            const percentAntigo = typeof anterior === 'object' ? (Number(anterior.percent) || 0) : Number(anterior);
            const realizadoAntigo = typeof anterior === 'object' ? (Number(anterior.realizado) || 0) : 0;
            
            // Compara os percentuais visíveis no velocímetro (1 casa decimal)
            const pAtualFmt = Number(percentAtual.toFixed(1));
            const pAntFmt = Number(percentAntigo.toFixed(1));
            const deltaVisivel = Number((pAtualFmt - pAntFmt).toFixed(1));
            const deltaR = realizadoAtual - realizadoAntigo;

            // Sensibilidade diferenciada:
            // Canais que já ultrapassaram a meta (>= 100%): exige variação maior (>= 0.5%) para evitar disparos frequentes
            // Canais em busca da meta (< 100%): exige variação padrão (>= 0.1%)
            // Canais sem meta (meta <= 0): exige variação financeira expressiva (>= R$ 1.000)
            const deltaMinimoSubida = (pAntFmt >= 100) ? 0.5 : 0.1;

            const oscilouSubida = (metaAtual > 0 && deltaVisivel >= deltaMinimoSubida) || 
                                  (metaAtual <= 0 && deltaR >= 1000.0);

            const oscilouQueda = (metaAtual > 0 && deltaVisivel <= -0.1) || 
                                 (metaAtual <= 0 && deltaR <= -1000.0);

            if (oscilouSubida) {
                if (cardElement) {
                    cardElement.classList.remove('oscilou-baixo');
                    cardElement.classList.add('oscilou-cima');
                    // Pisca verde continuamente até a próxima atualização
                }
                
                if (!tocouSomPositivo) {
                    tocouSomPositivo = true;
                    console.log(`[Oscilação] 💵 SUBIDA REAL em ${equipe.name}: ${pAntFmt.toFixed(1)}% -> ${pAtualFmt.toFixed(1)}% (Δ +${deltaVisivel.toFixed(1)}% >= +${deltaMinimoSubida}%). Tocando Caixa.`);
                    enfileirarAudioFrente('caixa');
                }
            } else if (oscilouQueda) {
                if (cardElement) {
                    cardElement.classList.remove('oscilou-cima');
                    cardElement.classList.add('oscilou-baixo');
                    // Pisca vermelho continuamente até a próxima atualização
                }
                
                if (!tocouSomNegativo) {
                    tocouSomNegativo = true;
                    console.log(`[Oscilação] 🚨 QUEDA REAL em ${equipe.name}: ${pAntFmt.toFixed(1)}% -> ${pAtualFmt.toFixed(1)}% (Δ ${deltaVisivel.toFixed(1)}%). Tocando Sirene.`);
                    enfileirarAudioFrente('policia');
                }
            } else {
                // Se esse card não oscilou nesta rodada, remove animação antiga
                if (cardElement) {
                    cardElement.classList.remove('oscilou-cima', 'oscilou-baixo');
                }
            }
        }
        
        novoEstado[chave] = { percent: percentAtual, realizado: realizadoAtual, meta: metaAtual };
    });

    localStorage.setItem('tv_estado_anterior_mes_atual', JSON.stringify(novoEstado));
}

let lastPeriodLoaded = '';

// Buscar dados da API
async function fetchData(forceRefresh = false) {
    try {
        const month = document.getElementById('filter-month').value;
        const year = document.getElementById('filter-year').value;
        
        const currentPeriod = `${month}_${year}`;
        if (lastPeriodLoaded && lastPeriodLoaded !== currentPeriod) {
            pararTodosAudios();
            isFirstDataLoad = true;
            ultimosPercentuaisCanais = {};
        }
        lastPeriodLoaded = currentPeriod;
        
        let url = `/api/vendas_tv?mes=${month}&ano=${year}`;
        if (forceRefresh) {
            url += `&refresh=1&_t=${Date.now()}`;
        }
        const response = await fetch(url);
        const json = await response.json();
        
        if (json.success) {
            window.currentVendasData = json.data;
            verificarOscilacao(json.data, month, year);
            renderCharts(json.data, month, year, json.contexto);
            processarAlertaPendente();
            
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

// Atualização manual pelo botão
async function manualRefresh() {
    desbloquearSomTV();
    pararTodosAudios();
    const month = document.getElementById('filter-month').value;
    const year = document.getElementById('filter-year').value;
    
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

let userExplicitlyChangedMonth = false;

// Inicializar combos: A guia Mensal (%) permanece SEMPRE no mês atual por regra mandatória da TV
function initFilters() {
    const urlParams = new URLSearchParams(window.location.search);
    const paramMes = urlParams.get('mes');
    const paramAno = urlParams.get('ano');

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    // Regra: Na guia Mensal (%), o padrão é SEMPRE o mês atual corrente
    const mesInicial = (paramMes && userExplicitlyChangedMonth) ? parseInt(paramMes) : currentMonth;
    const anoInicial = (paramAno && userExplicitlyChangedMonth) ? parseInt(paramAno) : currentYear;
    
    const monthSelect = document.getElementById('filter-month');
    const yearSelect = document.getElementById('filter-year');
    
    if (monthSelect) {
        monthSelect.value = mesInicial;
        monthSelect.addEventListener('change', () => {
            userExplicitlyChangedMonth = true;
            pararTodosAudios();
        });
    }
    if (yearSelect) {
        yearSelect.value = anoInicial;
        yearSelect.addEventListener('change', () => {
            userExplicitlyChangedMonth = true;
            pararTodosAudios();
        });
    }
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
        'music-sound', 'audio-distribuicao',
        'audio-ecommerce', 'audio-comex', 'audio-varejo-sp',
        'audio-varejo-reg', 'audio-parlux', 'audio-caixa', 'audio-policia'
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

    esconderStatusAudio();
    if (window.tvRotator && window.tvRotator.retomarAposAudio) {
        window.tvRotator.retomarAposAudio();
    }
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

    // REGRA DE OURO MQ: Canal que atingiu meta toca primeiro.
    // Se a Empresa também atingiu, a música da Empresa sempre toca por ÚLTIMO na fila.
    if (tipo === 'empresa') {
        audioQueue.push(tipo);
    } else {
        const empIdx = audioQueue.indexOf('empresa');
        if (empIdx !== -1) {
            audioQueue.splice(empIdx, 0, tipo);
        } else {
            audioQueue.push(tipo);
        }
    }
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
            audioEl.loop = false;
            audioEl.pause();
            audioEl.currentTime = 0;
            audioEl.onended = null;
        } catch (e) {}

        audioQueueRunning = false;
        currentAudioElement = null;

        // Retoma o rotacionador da TV se não há mais músicas na fila
        if (audioQueue.length === 0 && window.tvRotator && window.tvRotator.retomarAposAudio) {
            window.tvRotator.retomarAposAudio();
        }

        if (audioQueue.length > 0) {
            const proximoCanal = audioQueue[0];
            const proxConfig = AUDIO_CONFIG[proximoCanal];
            const proxNome = proxConfig ? proxConfig.nome.split('(')[0].trim() : proximoCanal;
            
            const isCurto = (config.id === 'audio-caixa' || config.id === 'audio-policia');
            let segundosRestantes = isCurto ? 0 : 10;
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
            
            const msEspera = isCurto ? 500 : 10000;
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
            if (window.tvRotator && window.tvRotator.retomarAposAudio) {
                window.tvRotator.retomarAposAudio();
            }
            setTimeout(() => {
                if (!audioQueueRunning && audioQueue.length === 0) {
                    esconderStatusAudio();
                }
            }, 6000);
        }
    };

    finalizarAudioCallback = finalizarAudio;
    audioEl.onended = finalizarAudio;

    const durDesc = config.duration ? `${config.duration / 1000}s` : 'música completa';
    console.log(`[Áudio Fila] 🎵 Tocando: ${config.nome} (${durDesc})`);
    audioEl.loop = (config.id === 'audio-policia');
    audioEl.play().then(() => {
        // Marca meta tocada no storage apenas quando a música realmente começar a tocar
        const mesAtual = document.getElementById('filter-month')?.value;
        const anoAtual = document.getElementById('filter-year')?.value;
        if (mesAtual && anoAtual) {
            marcarMetaComoTocada(proximoTipo, mesAtual, anoAtual);
        }
        // Se tiver duração definida, encerra no timeout.
        // Se for meta de canal ou empresa (duration == null), toca a música completa até o final!
        if (config.duration && config.duration > 0) {
            currentAudioTimeout = setTimeout(finalizarAudio, config.duration);
        } else {
            console.log(`[Áudio Fila] 🎵 ${config.nome}: Configurado para tocar a MÚSICA COMPLETA até o final.`);
        }

        // Opção A: Pausar o rotacionador da TV enquanto toca a música da Meta (Empresa ou Canal)
        if (config.duration === null && window.tvRotator && window.tvRotator.pausarParaAudio) {
            window.tvRotator.pausarParaAudio(config.nome);
        }

        esconderOverlayDesbloqueioTV();
    }).catch(e => {
        console.warn(`Erro ao tocar áudio ${config.nome}:`, e);
        audioQueueRunning = false;
        currentAudioElement = null;
        if (e.name === 'NotAllowedError') {
            // Devolve a música para o topo da fila para ser tocada assim que desbloquear
            audioQueue.unshift(proximoTipo);
            if (musicaAtualIndex > 0) musicaAtualIndex--;
            mostrarOverlayDesbloqueioTV(config.nome);
        } else {
            finalizarAudio();
        }
    });
}

function mostrarOverlayDesbloqueioTV(nomeMusica) {
    const el = document.getElementById('tv-audio-unlock-overlay');
    if (el) {
        el.style.display = 'flex';
        mostrarStatusAudio(`⚠️ Clique na tela ou pressione OK no controle remoto para liberar o som da TV (${nomeMusica || 'Músicas'})`, '#dc3545', 'rgba(220, 53, 69, 0.25)');
    }
}

function esconderOverlayDesbloqueioTV() {
    const el = document.getElementById('tv-audio-unlock-overlay');
    if (el) {
        el.style.display = 'none';
    }
}

let audioDesbloqueadoPeloUsuario = false;

function desbloquearAudiosNavegador() {
    esconderOverlayDesbloqueioTV();
    const allAudioIds = [
        'music-sound', 'audio-distribuicao',
        'audio-ecommerce', 'audio-comex', 'audio-varejo-sp',
        'audio-varejo-reg', 'audio-parlux', 'audio-caixa', 'audio-policia'
    ];
    allAudioIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.muted = true;
            const p = el.play();
            if (p) {
                p.then(() => {
                    el.pause();
                    el.currentTime = 0;
                    el.muted = false;
                }).catch(() => {
                    el.muted = false;
                });
            }
        }
    });
}

function desbloquearSomTV() {
    audioDesbloqueadoPeloUsuario = true;
    esconderOverlayDesbloqueioTV();
    desbloquearAudiosNavegador();
    
    // Se a fila de áudios já tiver músicas pendentes aguardando desbloqueio, inicia
    if (audioQueue.length > 0) {
        audioQueueRunning = false;
        processarFilaAudios();
    }
}

function onInteracaoUsuarioTV() {
    if (audioDesbloqueadoPeloUsuario) return;
    audioDesbloqueadoPeloUsuario = true;
    desbloquearSomTV();
}

['click', 'keydown', 'touchstart', 'pointerdown'].forEach(evt => {
    window.addEventListener(evt, onInteracaoUsuarioTV, { once: true, passive: true });
});

function verificarPermissaoAutoplay() {
    try {
        const testAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        testAudio.volume = 0;
        const playPromise = testAudio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                testAudio.pause();
                audioDesbloqueadoPeloUsuario = true;
                esconderOverlayDesbloqueioTV();
            }).catch(err => {
                console.log('[TV Áudio] Autoplay bloqueado pelo navegador da TV:', err.name);
                mostrarOverlayDesbloqueioTV('Músicas de Metas');
            });
        }
    } catch (e) {}
}

// Tocar a sequência completa de metas atingidas
function tocarSequenciaMetas(forcar = false) {
    desbloquearAudiosNavegador();
    pararTodosAudios();

    const data = window.currentVendasData || [];
    const mes = document.getElementById('filter-month')?.value;
    const ano = document.getElementById('filter-year')?.value;

    const equipesBatidas = data
        .filter(eq => (Number(eq.percent) || 0) >= 100)
        .sort((a, b) => (Number(b.percent) || 0) - (Number(a.percent) || 0));

    if (equipesBatidas.length === 0) {
        mostrarStatusAudio('ℹ️ Nenhum canal atingiu 100% de meta no período exibido.', '#ffc107', 'rgba(255, 193, 7, 0.25)');
        setTimeout(esconderStatusAudio, 5000);
        return;
    }

    if (forcar) {
        resetarTodasMetasTocadasDoMes(mes, ano);
    }

    equipesBatidas.forEach(equipe => {
        const chave = obterChaveCanal(equipe.name);
        if (chave) {
            if (forcar || !jaTocouMeta(chave, mes, ano)) {
                audioQueue.push(chave);
            }
        }
    });

    if (audioQueue.length > 0) {
        totalMusicasNaFila = audioQueue.length;
        musicaAtualIndex = 0;
        processarFilaAudios();
    } else {
        mostrarStatusAudio('ℹ️ Músicas das metas batidas já foram tocadas neste período.', '#ffc107', 'rgba(255, 193, 7, 0.25)');
        setTimeout(esconderStatusAudio, 5000);
    }
}

// Testar a sequência completa de metas atingidas
function testarSequenciaMetas() {
    tocarSequenciaMetas(true);
}

// Testar individualmente uma música
function testarAudioIndividual(tipo) {
    pararTodosAudios();
    fecharAudioDropdown();

    if (tipo && AUDIO_CONFIG[tipo]) {
        if (tipo === 'policia') {
            const cards = document.querySelectorAll('.gauge-card');
            if (cards && cards.length > 0) {
                cards[0].classList.remove('oscilou-cima');
                cards[0].classList.add('oscilou-baixo');
            }
        } else if (tipo === 'caixa') {
            const cards = document.querySelectorAll('.gauge-card');
            if (cards && cards.length > 0) {
                cards[0].classList.remove('oscilou-baixo');
                cards[0].classList.add('oscilou-cima');
            }
        }

        audioQueue = [tipo];
        totalMusicasNaFila = 1;
        musicaAtualIndex = 0;
        processarFilaAudios();
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
    verificarPermissaoAutoplay();
    
    // Timer para atualização periódica
    setInterval(() => {
        if (countdownSeconds > 0) {
            countdownSeconds--;
            updateCountdownDisplay();
        } else {
            countdownSeconds = 600;
            fetchData(true);
        }
    }, 1000);
});

// Responsividade
window.addEventListener('resize', function() {
    Object.values(charts).forEach(chart => {
        chart.resize();
    });
});


// Simulação de Supermetas para teste rápido na TV
window.simularSupermetaTV = function(canal, marco) {
    pararTodosAudios();
    desbloquearAudiosNavegador();
    const chave = canal.toLowerCase();
    const nomeCanal = (chave === 'empresa') ? 'Empresa' : 'Distribuição';
    console.log(`[TESTE TV] Simulando Supermeta de ${marco}% para ${nomeCanal}...`);
    
    const cardElement = document.querySelector(`[data-canal="${chave}"]`) || document.getElementById(`card-${chave}`);
    if (cardElement) {
        cardElement.classList.add('meta-batida');
        const badgeEl = cardElement.querySelector('.badge-objetivo-alcancado');
        if (badgeEl) {
            badgeEl.innerHTML = formatarTextoBadgeObjetivo(chave, marco, chave === 'empresa');
        }
    }
    
    mostrarStatusAudio(`🎉 [TESTE SUPERMETA] ${nomeCanal} atingiu ${marco}% de Meta!`, '#10b981', 'rgba(16, 185, 129, 0.25)');
    enfileirarAudio(chave);
};


// Simulação de teste da regra: Canal toca primeiro até o fim -> 10s de intervalo -> Empresa toca
window.simularCanalEEmpresaTV = function(canal = 'distribuicao') {
    pararTodosAudios();
    desbloquearAudiosNavegador();
    const chaveCanal = canal.toLowerCase();
    const nomeCanal = (chaveCanal === 'distribuicao') ? 'Distribuição' : 'Canal';
    console.log(`[TESTE TV] Simulando ${nomeCanal} + Empresa atingindo metas...`);
    mostrarStatusAudio(`🎉 [TESTE] ${nomeCanal} e Empresa bateram meta! Tocando ${nomeCanal} primeiro e Empresa após 10s.`, '#10b981', 'rgba(16, 185, 129, 0.25)');
    
    enfileirarAudio(chaveCanal);
    enfileirarAudio('empresa');
};
