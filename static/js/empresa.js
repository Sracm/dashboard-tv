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
    const diffText = sign + diff.toFixed(1) + '% vs META';
    const diffColor = isSuccess ? '#00d26a' : '#ff4d4d';

    return {
        series: [
            {
                type: 'gauge',
                startAngle: 180,
                endAngle: 0,
                min: 0,
                max: 120,
                splitNumber: 12,
                radius: '125%',
                center: ['50%', '72%'],
                axisLine: {
                    lineStyle: {
                        width: 26,
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
                    width: 10,
                    offsetCenter: [0, '-4%'],
                    itemStyle: {
                        color: '#f5c518',
                        shadowColor: 'rgba(0, 0, 0, 0.6)',
                        shadowBlur: 4
                    }
                },
                anchor: {
                    show: true,
                    showAbove: true,
                    size: 20,
                    itemStyle: {
                        color: '#121622',
                        borderWidth: 4,
                        borderColor: '#f5c518',
                        shadowColor: 'rgba(0, 0, 0, 0.8)',
                        shadowBlur: 6
                    }
                },
                axisTick: {
                    length: 7,
                    lineStyle: {
                        color: 'auto',
                        width: 1.5
                    }
                },
                splitLine: {
                    length: 14,
                    lineStyle: {
                        color: 'auto',
                        width: 2.5
                    }
                },
                axisLabel: {
                    show: false
                },
                title: {
                    offsetCenter: [0, '15%'],
                    fontSize: 44,
                    color: isSuccess ? '#00d26a' : '#ffffff',
                    fontWeight: '800',
                    fontFamily: 'Montserrat',
                    textShadowColor: isSuccess ? 'rgba(0, 210, 106, 0.6)' : 'rgba(0, 0, 0, 0.8)',
                    textShadowBlur: 12
                },
                detail: {
                    fontSize: 16,
                    offsetCenter: [0, '40%'],
                    valueAnimation: true,
                    formatter: function () {
                        return diffText;
                    },
                    color: diffColor,
                    fontWeight: '800',
                    fontFamily: 'Montserrat'
                },
                data: [
                    {
                        value: Math.min(Math.max(percent, 0), 120),
                        name: percent.toFixed(1) + '%'
                    }
                ]
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

    const urlParams = new URLSearchParams(window.location.search);
    const anoParam = urlParams.get('ano');
    const selectedAno = (anoParam && !isNaN(Number(anoParam))) ? parseInt(anoParam, 10) : defaultAno;
    if (yearEl) yearEl.value = selectedAno;

    // Determinar quais meses selecionar no filtro multiselect
    const mesParam = urlParams.get('mes');
    selectedMonths = [];

    if (mesParam && mesParam.includes(',')) {
        // Seleção múltipla explícita: ?mes=1,2,3
        const parsed = mesParam.split(',').map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 12);
        if (parsed.length > 0) selectedMonths = parsed;
    } else if (mesParam && !isNaN(Number(mesParam))) {
        // Único mês vindo da navegação (ex: ?mes=12 vindo de outra aba com "Acumulado até Dezembro")
        const singleM = parseInt(mesParam, 10);
        const limitM = (selectedAno === defaultAno) ? Math.min(singleM, currentM) : singleM;
        for (let m = 1; m <= limitM; m++) {
            selectedMonths.push(m);
        }
    } else {
        // Padrão: de Janeiro até o Mês Atual
        const limitM = (selectedAno === defaultAno) ? currentM : 12;
        for (let m = 1; m <= limitM; m++) {
            selectedMonths.push(m);
        }
    }

    if (selectedMonths.length === 0) {
        for (let m = 1; m <= currentM; m++) selectedMonths.push(m);
    }
    selectedMonths.sort((a, b) => a - b);

    const viewParam = urlParams.get('view');
    if (viewParam === 'acumulado' || viewParam === 'mes') {
        currentView = viewParam;
    } else {
        currentView = 'mes'; // Por padrão, abre em MÊS ATUAL
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

function formatMoedaCompleta(val) {
    if (val === null || val === undefined || isNaN(val)) return 'R$ 0';
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function formatMoedaCompacta(val) {
    const v = Number(val) || 0;
    if (v >= 1e6) return 'R$ ' + (v / 1e6).toFixed(2).replace('.', ',') + ' mi';
    if (v >= 1e3) return 'R$ ' + (v / 1e3).toFixed(0).replace('.', ',') + ' mil';
    return 'R$ ' + v.toFixed(0);
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

function renderCanaisContribuicao(canais, realizadoTotal) {
    const legendEl = document.getElementById('contrib-legend');
    const barEl = document.getElementById('contrib-bar');
    if (!legendEl || !barEl) return;

    if (!canais || canais.length === 0) {
        legendEl.innerHTML = '';
        barEl.innerHTML = '<div style="color:#64748b; font-size:0.75rem; text-align:center; width:100%;">Sem dados de canais no período</div>';
        return;
    }

    let legendHtml = '';
    let barHtml = '';

    canais.forEach(c => {
        const share = c.share || (realizadoTotal > 0 ? (c.realizado / realizadoTotal * 100) : 0);
        const cor = c.cor || '#0d6efd';

        legendHtml += `
            <div class="legend-item" title="${c.nome}: ${share.toFixed(1)}% de participação">
                <span class="legend-color" style="background: ${cor};"></span>
                <span class="legend-name">${c.nome}:</span>
                <span class="legend-share">${share.toFixed(1)}%</span>
            </div>
        `;

        if (share > 0) {
            barHtml += `
                <div class="contrib-segment" style="width: ${share.toFixed(2)}%; background: ${cor};" title="${c.nome}: ${share.toFixed(1)}% de participação">
                    ${share >= 8 ? `<span class="segment-label">${c.nome} ${share.toFixed(0)}%</span>` : ''}
                </div>
            `;
        }
    });

    legendEl.innerHTML = legendHtml;
    barEl.innerHTML = barHtml || '<div style="color:#64748b; font-size:0.75rem; text-align:center; width:100%;">Aguardando vendas no período</div>';
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

    const statusBadgeEl = document.getElementById('cockpit-status-badge');
    if (statusBadgeEl) {
        statusBadgeEl.innerText = currentView === 'acumulado' ? 'ACUMULADO' : 'MÊS ATUAL';
    }

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
            bannerEl.innerText = `META DA EMPRESA ATINGIDA: ${item.percent.toFixed(1)}% (${item.diff >= 0 ? "+" : ""}${item.diff.toFixed(1)}%)`;
        }
    } else {
        if (cardEl) {
            cardEl.classList.remove('atingiu-meta');
            cardEl.classList.remove('meta-batida');
        }
        if (bannerEl) bannerEl.classList.remove('show');
    }

    // ── Cartões de KPIs Operacionais (100% Percentual — Sem R$) ───
    const realValEl = document.getElementById('kpi-realizado-val');
    const realFillEl = document.getElementById('kpi-realizado-fill');
    const momBadgeEl = document.getElementById('kpi-mom-badge');
    
    // Card 1: Atingimento %
    if (realValEl) {
        realValEl.innerText = (item.percent || 0).toFixed(1) + '%';
        if (item.percent >= 100) {
            realValEl.style.color = '#00e676';
        } else if (item.percent >= 80) {
            realValEl.style.color = '#ffd600';
        } else {
            realValEl.style.color = '#ff5252';
        }
    }
    if (realFillEl) {
        const pctFill = Math.min(100, Math.max(0, item.percent || 0));
        realFillEl.style.width = pctFill.toFixed(1) + '%';
        if (item.percent >= 100) {
            realFillEl.style.background = 'linear-gradient(90deg, #10b981, #00e676)';
            realFillEl.style.boxShadow = '0 0 8px rgba(0, 230, 118, 0.6)';
        } else if (item.percent >= 80) {
            realFillEl.style.background = 'linear-gradient(90deg, #f59e0b, #ffd600)';
            realFillEl.style.boxShadow = '0 0 8px rgba(255, 214, 0, 0.6)';
        } else {
            realFillEl.style.background = 'linear-gradient(90deg, #ef4444, #ff5252)';
            realFillEl.style.boxShadow = '0 0 8px rgba(255, 82, 82, 0.6)';
        }
    }
    if (momBadgeEl) {
        if (currentView === 'mes') {
            const mom = item.mom;
            if (mom === null || mom === undefined) {
                momBadgeEl.className = 'trend-neutral';
                momBadgeEl.innerHTML = `— vs Mês Ant.`;
            } else {
                const sign = mom >= 0 ? '+' : '';
                const cls = mom > 0 ? 'trend-up' : (mom < 0 ? 'trend-down' : 'trend-neutral');
                const icon = mom > 0 ? '▲' : (mom < 0 ? '▼' : '➖');
                momBadgeEl.className = cls;
                momBadgeEl.innerHTML = `${icon} ${sign}${mom.toFixed(1)}% vs Mês Ant.`;
            }
        } else {
            const yoy = item.yoy;
            if (yoy === null || yoy === undefined) {
                momBadgeEl.className = 'trend-neutral';
                momBadgeEl.innerHTML = `— vs Ano Ant.`;
            } else {
                const sign = yoy >= 0 ? '+' : '';
                const cls = yoy > 0 ? 'trend-up' : (yoy < 0 ? 'trend-down' : 'trend-neutral');
                const icon = yoy > 0 ? '▲' : (yoy < 0 ? '▼' : '➖');
                momBadgeEl.className = cls;
                momBadgeEl.innerHTML = `${icon} ${sign}${yoy.toFixed(1)}% vs Ano Ant.`;
            }
        }
    }

    // Card 2: GAP % Restante
    const gapValEl = document.getElementById('kpi-gap-val');
    const diffPctEl = document.getElementById('kpi-diff-pct');
    const diasCountEl = document.getElementById('kpi-dias-count');
    const diasInfoEl = document.getElementById('kpi-dias-info');
    const gapPct = Math.max(0, 100 - (item.percent || 0));
    
    if (gapValEl) {
        if (item.percent >= 100) {
            gapValEl.innerText = '0.0%';
            gapValEl.style.color = '#00e676';
        } else {
            gapValEl.innerText = gapPct.toFixed(1) + '%';
            gapValEl.style.color = '#ff4d4d';
        }
    }
    if (diffPctEl) {
        const diff = item.diff !== undefined ? item.diff : ((item.percent || 0) - 100);
        diffPctEl.className = diff >= 0 ? 'trend-up' : 'trend-down';
        diffPctEl.innerText = (diff >= 0 ? `+${diff.toFixed(1)}% superada` : `${diff.toFixed(1)}% restante`);
    }
    if (diasCountEl) diasCountEl.innerText = item.dias_uteis_restantes !== undefined ? item.dias_uteis_restantes : 20;
    if (diasInfoEl) {
        diasInfoEl.style.display = currentView === 'mes' ? 'inline-flex' : 'none';
    }

    // Card 3: Objetivo Corporativo (100.0%)
    const metaValEl = document.getElementById('kpi-meta-val');
    const metaLabelEl = document.getElementById('kpi-meta-label');
    if (metaValEl) metaValEl.innerText = '100.0%';
    if (metaLabelEl) {
        metaLabelEl.innerText = currentView === 'acumulado' ? 'Objetivo Acumulado' : 'Meta Mensal MQ';
    }

    // Card 4: Ritmo Diário (%/dia) ou YoY no Acumulado
    const ritmoValEl = document.getElementById('kpi-ritmo-val');
    const ritmoTitleEl = document.getElementById('kpi-ritmo-title');
    const ritmoSubEl = document.getElementById('kpi-ritmo-sub');
    
    if (currentView === 'mes') {
        if (ritmoTitleEl) ritmoTitleEl.innerText = 'RITMO DIÁRIO NECESSÁRIO';
        if (ritmoSubEl) ritmoSubEl.innerHTML = '<span>% da meta por dia útil restante</span>';
        if (ritmoValEl) {
            if (item.percent >= 100) {
                ritmoValEl.innerText = '0.00%/dia';
                ritmoValEl.style.color = '#00e676';
            } else {
                const dias = (item.dias_uteis_restantes !== undefined) ? item.dias_uteis_restantes : 20;
                const rPct = (dias > 0 && gapPct > 0) ? (gapPct / dias) : 0;
                ritmoValEl.innerText = rPct.toFixed(2) + '%/dia';
                ritmoValEl.style.color = '#ffd600';
            }
        }
    } else {
        if (ritmoTitleEl) ritmoTitleEl.innerText = 'CRESCIMENTO ANUAL (YoY)';
        if (ritmoSubEl) ritmoSubEl.innerHTML = '<span>vs mesmo período ano anterior</span>';
        if (ritmoValEl) {
            const yoy = item.yoy;
            if (yoy === null || yoy === undefined) {
                ritmoValEl.innerText = '—';
                ritmoValEl.style.color = '#94a3b8';
            } else {
                const sign = yoy >= 0 ? '+' : '';
                ritmoValEl.innerText = `${sign}${yoy.toFixed(1)}%`;
                ritmoValEl.style.color = yoy >= 0 ? '#00e676' : '#ff4d4d';
            }
        }
    }

    // ── Velocímetro Central ────────────────────────────────────
    if (!empresaChart) {
        const chartEl = document.getElementById('empresa-gauge');
        if (chartEl) empresaChart = echarts.init(chartEl);
    }
    if (empresaChart) {
        empresaChart.setOption(getEmpresaGaugeOption(item.percent, item.diff));
        empresaChart.resize();
    }

    // ── Comparativos do Rodapé do Cockpit ──────────────────────
    const compContainer = document.getElementById('empresa-comparisons');
    if (compContainer) {
        let badgesHtml = '';
        if (currentView === 'mes') {
            const mom = item.mom || 0;
            const prevMonth = item.prev_month_percent !== undefined ? item.prev_month_percent : 0;
            if (prevMonth > 0) badgesHtml += renderValueBadge('Mês Ant', prevMonth);
            if (mom !== 0) badgesHtml += renderTrendBadge('MoM', mom);
            const yoy = item.yoy || 0;
            if (yoy !== 0) badgesHtml += renderTrendBadge('YoY', yoy);
        } else {
            const prevYear = item.prev_year_percent !== undefined ? item.prev_year_percent : 0;
            const yoy = item.yoy || 0;
            if (prevYear > 0) badgesHtml += renderValueBadge('Ano Anterior', prevYear);
            if (yoy !== 0) badgesHtml += renderTrendBadge('YoY (Crescimento)', yoy);
        }
        if (badgesHtml) {
            compContainer.innerHTML = badgesHtml;
            compContainer.style.display = 'flex';
        } else {
            compContainer.innerHTML = '';
            compContainer.style.display = 'none';
        }
    }

    // ── Barra de Contribuição por Canal ────────────────────────
    renderCanaisContribuicao(item.canais, item.realizado);
    
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
    const cardEl = document.getElementById('empresa-card-el');
    const atual = Number(item.percent) || 0;
    
    if (anteriorEmpresaPercent !== null && !isNaN(anteriorEmpresaPercent)) {
        const pAtualFmt = Number(atual.toFixed(1));
        const pAntFmt = Number(anteriorEmpresaPercent.toFixed(1));
        const deltaVisivel = Number((pAtualFmt - pAntFmt).toFixed(1));
        
        if (deltaVisivel <= -0.1) {
            if (cardEl) {
                cardEl.classList.remove('oscilou-cima');
                cardEl.classList.add('oscilou-baixo');
            }
            const audioPol = document.getElementById('audio-policia');
            if (audioPol) {
                audioPol.currentTime = 0;
                audioPol.volume = 1.0;
                audioPol.loop = true;
                audioPol.play().catch(() => {});
                setTimeout(() => { try { audioPol.loop = false; audioPol.pause(); audioPol.currentTime = 0; } catch(e){} }, 15000);
            }
            const deltaMinimoSubida = (pAntFmt >= 100) ? 0.5 : 0.1;
            if (deltaVisivel >= deltaMinimoSubida) {
                if (cardEl) {
                    cardEl.classList.remove('oscilou-baixo');
                    cardEl.classList.add('oscilou-cima');
                }
                const audioCx = document.getElementById('audio-caixa');
                if (audioCx) {
                    audioCx.currentTime = 0;
                    audioCx.volume = 1.0;
                    audioCx.play().catch(() => {});
                    setTimeout(() => { try { audioCx.pause(); audioCx.currentTime = 0; } catch(e){} }, 4000);
                }
            }
        } else {
            if (cardEl) {
                cardEl.classList.remove('oscilou-cima', 'oscilou-baixo');
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
    const audioMusica = document.getElementById('music-sound');
    if (audioMusica) {
        audioMusica.onended = null;
        audioMusica.pause();
        audioMusica.currentTime = 0;
    }
    ['audio-policia', 'audio-caixa'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            try {
                el.pause();
                el.currentTime = 0;
            } catch (e) {}
        }
    });
    if (window.tvRotator && window.tvRotator.retomarAposAudio) {
        window.tvRotator.retomarAposAudio();
    }
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

        // Opção A: Pausar o rotacionador da TV enquanto toca a música da Empresa
        if (window.tvRotator && window.tvRotator.pausarParaAudio) {
            window.tvRotator.pausarParaAudio('Meta Empresa (Van Halen - Jump)');
        }

        // Tocar a MÚSICA TODA: aguarda término natural da faixa
        audioMusica.onended = function () {
            console.log("[Empresa] 🎵 Música completa finalizada com sucesso.");
            if (window.tvRotator && window.tvRotator.retomarAposAudio) {
                window.tvRotator.retomarAposAudio();
            }
        };

        audioMusica.play().then(() => {
            console.log("[Empresa] 🎵 Tocando Van Halen - Jump na íntegra (música completa)!");
        }).catch(e => {
            console.warn("Erro ao tocar música Empresa:", e);
            if (window.tvRotator && window.tvRotator.retomarAposAudio) {
                window.tvRotator.retomarAposAudio();
            }
        });
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
