// ============================================================
// empresa.js — Aba EMPRESA
// Velocímetro gigante da Empresa com efeito piscando de meta batida
// ============================================================

let empresaChart = null;
let ytdYoyChart = null;
let empresaData = null;
let currentView = 'mes'; // 'mes' ou 'acumulado'
let nextUpdateSeconds = 600;
let audioPlayed = false;

let selectedMonths = [new Date().getMonth() + 1];
const nomesMeses = {
    1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr',
    5: 'Mai', 6: 'Jun', 7: 'Jul', 8: 'Ago',
    9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez'
};
const nomesMesesCompletos = {
    1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
    5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
    9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
};

function navigateTab(path) {
    pararTodosAudios();
    if (path === '/tv' || path === '/') {
        window.location.href = '/tv';
        return;
    }
    const mes = selectedMonths.join(',');
    const ano = document.getElementById('filter-year') ? document.getElementById('filter-year').value : '';
    window.location.href = `${path}?mes=${mes}&ano=${ano}`;
}

// Parar qualquer áudio imediatamente ao sair da página
window.addEventListener('beforeunload', () => pararTodosAudios());
window.addEventListener('pagehide', () => pararTodosAudios());

// ── Controle de Áudio Tocado Apenas Uma Vez por Meta ────────
function jaTocouMeta(chave, mes, ano) {
    const k = `meta_som_tocada_${chave}_${mes}_${ano}`;
    return localStorage.getItem(k) === 'true';
}

function marcarMetaComoTocada(chave, mes, ano) {
    const k = `meta_som_tocada_${chave}_${mes}_${ano}`;
    localStorage.setItem(k, 'true');
}

function resetarMetaTocada(chave, mes, ano) {
    const k = `meta_som_tocada_${chave}_${mes}_${ano}`;
    localStorage.removeItem(k);
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

function getEmpresaGaugeOption(percent, diff) {
    const isSuccess = percent >= 100;
    const sign = diff >= 0 ? '+' : '';
    const diffText = sign + diff.toFixed(1) + '%';
    const diffColor = diff >= 0 ? '#00d26a' : '#ff2424';

    return {
        series: [
            {
                type: 'gauge',
                startAngle: 180,
                endAngle: 0,
                min: 0,
                max: 120,
                splitNumber: 12,
                radius: '115%',
                center: ['50%', '70%'],
                axisLine: {
                    lineStyle: {
                        width: 30,
                        color: [
                            [80 / 120, '#ff2424'],
                            [100 / 120, '#ffd600'],
                            [1, '#00d26a']
                        ]
                    }
                },
                pointer: {
                    icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
                    length: '65%',
                    width: 10,
                    offsetCenter: [0, '-4%'],
                    itemStyle: { 
                        color: '#f5c518',
                        shadowColor: 'rgba(0,0,0,0.6)',
                        shadowBlur: 5
                    }
                },
                axisTick: {
                    length: 8,
                    lineStyle: { color: 'auto', width: 1.5 }
                },
                splitLine: {
                    length: 15,
                    lineStyle: { color: 'auto', width: 2.5 }
                },
                axisLabel: {
                    show: false
                },
                title: {
                    offsetCenter: [0, '18%'],
                    fontSize: 32,
                    color: '#ffffff',
                    fontWeight: '800',
                    fontFamily: 'Montserrat'
                },
                detail: {
                    fontSize: 18,
                    offsetCenter: [0, '42%'],
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

function initFilters() {
    const now = new Date();
    const defaultAno = now.getFullYear();
    const currentM = now.getMonth() + 1;

    const yearEl = document.getElementById('filter-year');
    if (yearEl) yearEl.value = defaultAno;

    // Na Guia Empresa, vamos deixar setado de Janeiro até o Mês Atual por padrão (YTD)
    selectedMonths = [];
    for (let m = 1; m <= currentM; m++) {
        selectedMonths.push(m);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const anoParam = urlParams.get('ano');
    if (anoParam && yearEl) yearEl.value = anoParam;

    const mesParam = urlParams.get('mes');
    if (mesParam) {
        const parsed = mesParam.split(',').map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 12);
        if (parsed.length > 0) {
            selectedMonths = parsed;
        }
    }

    const viewParam = urlParams.get('view');
    if (viewParam === 'mes' || viewParam === 'acumulado') {
        currentView = viewParam;
    } else if (selectedMonths.length > 1) {
        currentView = 'acumulado';
    }

    document.querySelectorAll('.sub-nav-empresa .tab-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`btn-view-${currentView}`);
    if (btn) btn.classList.add('active');

    initMonthMultiselect();
}

function initMonthMultiselect() {
    const grid = document.getElementById('month-checkbox-grid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let m = 1; m <= 12; m++) {
        const isChecked = selectedMonths.includes(m);
        const item = document.createElement('label');
        item.className = `ms-item ${isChecked ? 'checked' : ''}`;
        item.id = `ms-item-${m}`;
        item.innerHTML = `
            <input type="checkbox" class="ms-checkbox" value="${m}" ${isChecked ? 'checked' : ''} onchange="onMonthCheckChange(${m})">
            <span>${nomesMeses[m]}</span>
        `;
        grid.appendChild(item);
    }
    updateMonthSelectLabel();
}

function toggleMonthDropdown(event) {
    if (event) event.stopPropagation();
    const wrapper = document.getElementById('month-multiselect');
    if (wrapper) {
        wrapper.classList.toggle('open');
    }
}

function onMonthCheckChange(m) {
    if (selectedMonths.includes(m)) {
        selectedMonths = selectedMonths.filter(x => x !== m);
    } else {
        selectedMonths.push(m);
        selectedMonths.sort((a, b) => a - b);
    }

    const item = document.getElementById(`ms-item-${m}`);
    if (item) {
        item.classList.toggle('checked', selectedMonths.includes(m));
    }

    updateMonthSelectLabel();
    fetchData();
}

function selectAllMonths(all, event) {
    if (event) event.stopPropagation();
    if (all) {
        selectedMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    } else {
        selectedMonths = [];
    }
    syncCheckboxUI();
    updateMonthSelectLabel();
    fetchData();
}

function selectLastNMonths(n, event) {
    if (event) event.stopPropagation();
    const refM = selectedMonths.length > 0 ? selectedMonths[selectedMonths.length - 1] : 8;
    const startM = Math.max(1, refM - n + 1);
    selectedMonths = [];
    for (let m = startM; m <= refM; m++) {
        selectedMonths.push(m);
    }
    syncCheckboxUI();
    updateMonthSelectLabel();
    fetchData();
}

function syncCheckboxUI() {
    for (let m = 1; m <= 12; m++) {
        const item = document.getElementById(`ms-item-${m}`);
        if (item) {
            const isChecked = selectedMonths.includes(m);
            item.classList.toggle('checked', isChecked);
            const chk = item.querySelector('input');
            if (chk) chk.checked = isChecked;
        }
    }
}

function updateMonthSelectLabel() {
    const labelEl = document.getElementById('month-select-label');
    const badgeEl = document.getElementById('ms-count-badge');
    const hiddenMonthEl = document.getElementById('filter-month');
    const count = selectedMonths.length;

    if (badgeEl) badgeEl.innerText = `${count} sel.`;

    if (hiddenMonthEl) {
        hiddenMonthEl.value = selectedMonths.join(',');
    }

    if (!labelEl) return;

    if (count === 0) {
        labelEl.innerText = 'Nenhum mês';
    } else if (count === 12) {
        labelEl.innerText = 'Todos os 12 meses';
    } else if (count === 1) {
        labelEl.innerText = nomesMesesCompletos[selectedMonths[0]] || nomesMeses[selectedMonths[0]];
    } else if (count === 8 && selectedMonths.every((val, i) => val === i + 1)) {
        labelEl.innerText = 'Jan a Ago (8)';
    } else if (count <= 3) {
        labelEl.innerText = selectedMonths.map(m => nomesMeses[m]).join(', ');
    } else {
        const first = nomesMeses[selectedMonths[0]];
        const last = nomesMeses[selectedMonths[selectedMonths.length - 1]];
        labelEl.innerText = `${first}..${last} (${count} meses)`;
    }
}

document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('month-multiselect');
    if (wrapper && wrapper.classList.contains('open')) {
        if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
        }
    }
});

function setEmpresaView(view) {
    pararTodosAudios();
    currentView = view;
    document.querySelectorAll('.sub-nav-empresa .tab-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`btn-view-${view}`);
    if (btn) btn.classList.add('active');

    renderEmpresa();
}

function formatMoeda(val) {
    if (val === null || val === undefined || isNaN(val)) return 'R$ 0,00';
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderTrendBadge(label, diff) {
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
}

function renderValueBadge(label, val) {
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
}

function renderAmountBadge(label, val) {
    return `<div class="comparison-badge">
                <span class="badge-label">${label}:</span>
                <span class="badge-value val-neutral" style="color: #fff; font-weight:700;">${formatMoeda(val)}</span>
            </div>`;
}

function renderEmpresa() {
    if (!empresaData) return;

    const item = currentView === 'acumulado' ? empresaData.acumulado : empresaData.mes;
    
    const count = selectedMonths.length;
    let labelPeriodo = 'PERÍODO';
    if (count === 12) {
        labelPeriodo = 'ANO COMPLETO';
    } else if (count === 1) {
        labelPeriodo = (nomesMesesCompletos[selectedMonths[0]] || '').toUpperCase();
    } else if (count > 1) {
        const first = nomesMeses[selectedMonths[0]];
        const last = nomesMeses[selectedMonths[selectedMonths.length - 1]];
        labelPeriodo = `${first} A ${last} (${count} MESES)`.toUpperCase();
    }

    const titleText = currentView === 'acumulado' 
        ? `EMPRESA (ACUMULADO - ${labelPeriodo})` 
        : `EMPRESA (MÊS ATUAL)`;

    const titleEl = document.getElementById('empresa-card-title');
    if (titleEl) titleEl.innerText = titleText;

    const cardEl = document.getElementById('empresa-card-el');
    const bannerEl = document.getElementById('meta-banner-el');

    const metaAtingida = item.atingiu_meta || (item.percent >= 100);

    if (metaAtingida) {
        if (cardEl) {
            cardEl.classList.add('atingiu-meta');
            cardEl.classList.add('meta-batida');
        }
        if (bannerEl) {
            bannerEl.classList.add('show');
            bannerEl.innerText = `🎉 META ATINGIDA: ${item.percent.toFixed(1)}% (${item.diff >= 0 ? '+' : ''}${item.diff.toFixed(1)}%) 🎉`;
        }
    } else {
        if (cardEl) {
            cardEl.classList.remove('atingiu-meta');
            cardEl.classList.remove('meta-batida');
        }
        if (bannerEl) bannerEl.classList.remove('show');
    }

    const ytdYoyContainer = document.getElementById('ytd-yoy-container');
    const ytdYoyBanner = document.getElementById('ytd-yoy-banner-el');
    const mainContainer = document.getElementById('main-gauge-container');
    const ytdYoyCard = document.getElementById('ytd-yoy-card-el');
    
    if (currentView === 'acumulado') {
        if (mainContainer) {
            mainContainer.style.maxWidth = 'none';
            mainContainer.style.flex = '1';
        }
        if (ytdYoyContainer) {
            ytdYoyContainer.style.display = 'flex';
            ytdYoyContainer.style.maxWidth = 'none';
            ytdYoyContainer.style.flex = '1';
        }
        
        // Exibir banner de "SUPEROU ANO ANTERIOR" se YTD YoY > 0
        if (ytdYoyBanner) {
            if ((item.yoy || 0) > 0) {
                ytdYoyBanner.classList.add('show');
                if (ytdYoyCard) {
                    ytdYoyCard.classList.add('atingiu-meta');
                    ytdYoyCard.classList.add('meta-batida');
                }
            } else {
                ytdYoyBanner.classList.remove('show');
                if (ytdYoyCard) {
                    ytdYoyCard.classList.remove('atingiu-meta');
                    ytdYoyCard.classList.remove('meta-batida');
                }
            }
        }
    } else {
        if (mainContainer) {
            mainContainer.style.maxWidth = '920px';
            mainContainer.style.flex = '1';
        }
        if (ytdYoyContainer) ytdYoyContainer.style.display = 'none';
    }

    // Inicializar e configurar gráficos com os containers já com display correto
    if (!empresaChart) {
        const chartEl = document.getElementById('empresa-gauge');
        if (chartEl) empresaChart = echarts.init(chartEl);
    }
    if (empresaChart) {
        empresaChart.setOption(getEmpresaGaugeOption(item.percent, item.diff));
        empresaChart.resize();
    }

    if (currentView === 'acumulado') {
        if (!ytdYoyChart) {
            const ytdYoyEl = document.getElementById('ytd-yoy-gauge');
            if (ytdYoyEl) ytdYoyChart = echarts.init(ytdYoyEl);
        }
        if (ytdYoyChart) {
            const ytdYoyPercent = (item.yoy || 0) + 100;
            const ytdYoyDiff = (item.yoy || 0);
            ytdYoyChart.setOption(getEmpresaGaugeOption(ytdYoyPercent, ytdYoyDiff));
            ytdYoyChart.resize();
        }
    }

    // Renderizar Comparativos abaixo do velocímetro (apenas percentuais, sem valores em R$)
    const compContainer = document.getElementById('empresa-comparisons');
    if (compContainer) {
        let badgesHtml = '';
        if (currentView === 'mes') {
            const mom = item.mom || 0;
            const prevMonth = item.prev_month_percent !== undefined ? item.prev_month_percent : 0;
            if (prevMonth > 0) badgesHtml += renderValueBadge('Mês Ant', prevMonth);
            if (mom !== 0) badgesHtml += renderTrendBadge('MoM', mom);
        }
        if (badgesHtml) {
            compContainer.innerHTML = badgesHtml;
            compContainer.style.display = 'flex';
        } else {
            compContainer.innerHTML = '';
            compContainer.style.display = 'none';
        }
    }

    const ytdCompContainer = document.getElementById('ytd-comparisons');
    if (ytdCompContainer) {
        if (currentView === 'acumulado') {
            let badgesHtml = '';
            const prevYear = item.prev_year_percent !== undefined ? item.prev_year_percent : 0;
            const yoy = item.yoy || 0;
            if (prevYear > 0) badgesHtml += renderValueBadge('Ano Anterior', prevYear);
            badgesHtml += renderTrendBadge('YoY (Crescimento)', yoy);
            ytdCompContainer.innerHTML = badgesHtml;
            ytdCompContainer.style.display = 'flex';
        } else {
            ytdCompContainer.style.display = 'none';
        }
    }
    
    // Ensure charts resize accurately after layout recalculations
    setTimeout(() => {
        if (empresaChart) empresaChart.resize();
        if (ytdYoyChart && currentView === 'acumulado') ytdYoyChart.resize();
    }, 150);
}

async function fetchData(forceRefresh = false) {
    const meses = selectedMonths.join(',');
    const ano = document.getElementById('filter-year') ? document.getElementById('filter-year').value : '2026';
    
    try {
        let url = `/api/empresa_tv?meses=${meses}&ano=${ano}`;
        if (forceRefresh) {
            url += `&refresh=1&_t=${Date.now()}`;
        }
        const response = await fetch(url);
        const json = await response.json();
        
        if (json.success && json.data) {
            empresaData = json.data;
            const currentItem = currentView === 'acumulado' ? empresaData.acumulado : empresaData.mes;
            verificarOscilacaoEmpresa(currentItem);
            renderEmpresa();

            const lastUpdateEl = document.getElementById('last-update');
            if (lastUpdateEl) {
                lastUpdateEl.innerText = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
            }
        }
    } catch (e) {
        console.error("Erro ao carregar dados da empresa:", e);
    }
}

let anteriorEmpresaPercent = null;

function verificarOscilacaoEmpresa(item) {
    if (!item) return;
    const atual = Number(item.percent) || 0;
    if (anteriorEmpresaPercent !== null && !isNaN(anteriorEmpresaPercent)) {
        const delta = atual - anteriorEmpresaPercent;
        const cardEl = document.getElementById('empresa-card-el');
        if (delta < -0.005) {
            if (cardEl) {
                cardEl.classList.remove('oscilou-cima');
                cardEl.classList.add('oscilou-baixo');
                setTimeout(() => cardEl.classList.remove('oscilou-baixo'), 8000);
            }
            const audioPol = document.getElementById('audio-policia');
            if (audioPol) {
                audioPol.currentTime = 0;
                audioPol.volume = 1.0;
                audioPol.play().catch(() => {});
                setTimeout(() => { try { audioPol.pause(); audioPol.currentTime = 0; } catch(e){} }, 7000);
            }
        } else if (delta > 0.005) {
            if (cardEl) {
                cardEl.classList.remove('oscilou-baixo');
                cardEl.classList.add('oscilou-cima');
                setTimeout(() => cardEl.classList.remove('oscilou-cima'), 5000);
            }
            const audioCx = document.getElementById('audio-caixa');
            if (audioCx) {
                audioCx.currentTime = 0;
                audioCx.volume = 1.0;
                audioCx.play().catch(() => {});
                setTimeout(() => { try { audioCx.pause(); audioCx.currentTime = 0; } catch(e){} }, 4000);
            }
        }
    }
    anteriorEmpresaPercent = atual;
}

function manualRefresh() {
    pararTodosAudios();
    nextUpdateSeconds = 600;
    fetchData(true);
}

let musicaTimeout = null;

function pararTodosAudios() {
    if (musicaTimeout) {
        clearTimeout(musicaTimeout);
        musicaTimeout = null;
    }
    ['music-sound', 'audio-policia', 'audio-caixa'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            try {
                el.pause();
                el.currentTime = 0;
            } catch (e) {}
        }
    });
}

function testarAudio(tipo) {
    tocarAudioMetaEmpresa();
}

function tocarAudioMetaEmpresa() {
    pararTodosAudios();

    const audioMusica = document.getElementById('music-sound');
    if (audioMusica) {
        audioMusica.currentTime = 0;
        audioMusica.volume = 1.0;
        audioMusica.play().catch(e => console.warn("Erro ao tocar música Empresa:", e));
        musicaTimeout = setTimeout(() => {
            audioMusica.pause();
            audioMusica.currentTime = 0;
        }, 28000); // 28 segundos (Van Halen - Jump)
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    fetchData();

    setInterval(updateClock, 1000);
    updateClock();

    // Adicionar listener de redimensionamento para os gráficos
    window.addEventListener('resize', () => {
        if (empresaChart) empresaChart.resize();
        if (ytdYoyChart) ytdYoyChart.resize();
    });
});
