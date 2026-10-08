let nextUpdateSeconds = 600;
let currentView = 'canal'; // 'categoria' ou 'marca'
let currentMetric = 'completo'; // 'completo', 'share', 'mom', 'yoy'
let currentData = null;
let currentSort = { column: 'rank', asc: true };
const nomesMeses = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function getDefault4Months() {
    const currentM = new Date().getMonth() + 1;
    const months = [];
    for (let i = 4; i >= 1; i--) {
        let pastM = currentM - i;
        if (pastM <= 0) pastM += 12;
        months.push(pastM);
    }
    months.sort((a, b) => a - b);
    return months;
}

// Default para os ultimos 4 meses antes do mes atual
let selectedMonths = getDefault4Months();

function pararTodosAudios() {
    const audio = document.getElementById('victory-sound');
    const musica = document.getElementById('music-sound');
    if (audio) { audio.pause(); audio.currentTime = 0; }
    if (musica) { musica.pause(); musica.currentTime = 0; }
}

function navigateTab(path) {
    pararTodosAudios();
    if (path === '/tv' || path === '/') {
        window.location.href = '/tv';
        return;
    }
    const mes = document.getElementById('filter-month')?.value || 8;
    const ano = document.getElementById('filter-year')?.value || 2026;
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
        fetchData();
    }
    const nextEl = document.getElementById('next-update');
    if (nextEl) {
        const m = Math.floor(nextUpdateSeconds / 60);
        const s = nextUpdateSeconds % 60;
        nextEl.innerText = `Próxima atualização em: ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
}

function initFilters() {
    const urlParams = new URLSearchParams(window.location.search);
    const now = new Date();
    const defaultAno = now.getFullYear();

    const ano = urlParams.get('ano') || defaultAno;
    const yearEl = document.getElementById('filter-year');
    if (yearEl) yearEl.value = ano;

    const mesParam = urlParams.get('mes');
    if (mesParam && mesParam.includes(',')) {
        const parsed = mesParam.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x) && x >= 1 && x <= 12);
        // Se vier com muitos meses (ex: vindo de outra guia), forçar os últimos 4 meses sem contar o atual
        if (parsed.length > 4 || parsed.includes(new Date().getMonth() + 1)) {
            selectedMonths = getDefault4Months();
        } else {
            selectedMonths = parsed;
        }
    } else {
        selectedMonths = getDefault4Months();
    }

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
    renderTable();
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
    renderTable();
}

function selectLastNMonths(n, event) {
    if (event) event.stopPropagation();
    const refM = currentData?.mes || 8;
    const startM = Math.max(1, refM - n + 1);
    selectedMonths = [];
    for (let m = startM; m <= refM; m++) {
        selectedMonths.push(m);
    }
    syncCheckboxUI();
    updateMonthSelectLabel();
    renderTable();
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

    if (hiddenMonthEl && selectedMonths.length > 0) {
        hiddenMonthEl.value = selectedMonths[selectedMonths.length - 1];
    }

    if (!labelEl) return;

    if (count === 0) {
        labelEl.innerText = 'Nenhum mês';
    } else if (count === 12) {
        labelEl.innerText = 'Todos os 12 meses';
    } else if (count === 1) {
        labelEl.innerText = nomesMeses[selectedMonths[0]];
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

function formatMoeda(val) {
    if (val === null || val === undefined || isNaN(val)) return 'R$ 0,00';
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPct(val) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    const sinal = val > 0 ? '+' : '';
    return `${sinal}${Number(val).toFixed(1)}%`;
}

function renderDeltaBadge(delta) {
    if (delta === null || delta === undefined) {
        return `<span class="delta-badge new">★ NOVO</span>`;
    }
    if (delta > 0) {
        return `<span class="delta-badge up">▲ +${delta}</span>`;
    }
    if (delta < 0) {
        return `<span class="delta-badge down">▼ ${Math.abs(delta)}</span>`;
    }
    return `<span class="delta-badge equal">—</span>`;
}

function renderRankBadge(rank) {
    if (rank === 1) return `<span class="rank-badge rank-1">1º</span>`;
    if (rank === 2) return `<span class="rank-badge rank-2">2º</span>`;
    if (rank === 3) return `<span class="rank-badge rank-3">3º</span>`;
    return `<span class="rank-badge rank-other">${rank}º</span>`;
}

function renderStatusTag(status) {
    const s = (status || 'Estável').toLowerCase();
    let cls = 'estavel';
    let tooltip = 'Estável: Variação de ranking e faturamento (MoM) sem oscilações drásticas.';

    if (s.includes('líder') || s.includes('lider')) {
        cls = 'lider';
        tooltip = 'Líder: A categoria ou marca está no Top 2 em vendas.';
    }
    else if (s.includes('expansão') || s.includes('expansao')) {
        cls = 'expansao';
        tooltip = 'Expansão: Crescimento ≥ 15% (MoM) OU subiu 2+ posições no ranking.';
    }
    else if (s.includes('atenção') || s.includes('atencao')) {
        cls = 'atencao';
        tooltip = 'Atenção: Queda ≥ -15% (MoM) OU caiu 2+ posições no ranking.';
    }

    return `<span class="status-tag ${cls}" title="${tooltip}">${status}</span>`;
}

function switchMetric(met) {
    currentMetric = met;
    ['completo', 'share', 'mom', 'yoy'].forEach(m => {
        const btn = document.getElementById(`btn-met-${m}`);
        if (btn) btn.classList.toggle('active', m === met);
    });
    renderTable();
}

function renderTableHeader() {
    const theadRow = document.getElementById('table-header-row');
    if (!theadRow || !currentData) return;

    const itemLabel = currentView === 'categoria' ? 'Categoria Analítica' : 'Marca';
    const allMeses = currentData.meses_colunas || [];
    const meses = allMeses.filter(m => selectedMonths.includes(m.num));
    const mesRef = currentData.mes;

    let html = `
        <th class="col-rank sortable text-center" onclick="sortTable('rank')"># ↕</th>
        <th class="col-item sortable text-left" onclick="sortTable('item')" style="min-width: 180px; max-width: 220px;">${itemLabel} ↕</th>
    `;

    meses.forEach(m => {
        const isRef = m.num === mesRef;
        const refClass = isRef ? 'active-month-th' : '';
        const refTag = isRef ? ' <span class="ref-badge">M-1 Fechado</span>' : '';

        // Mês Principal
        html += `<th class="col-mes-header sortable text-right ${refClass}" onclick="sortTable('mes_${m.num}')" title="Faturamento e Share do mês de ${m.label}" style="border-left: 1px solid #475569; padding: 4px 2px; font-size: 0.8rem; white-space: nowrap;">${m.label}${refTag} ↕</th>`;
        // Coluna MoM
        html += `<th class="col-mes-mom text-center ${refClass}" style="font-size:0.75rem; color:#aaa; padding: 4px 2px; white-space: nowrap;" title="MoM (Month-over-Month): Crescimento percentual em relação ao mês imediatamente anterior">MoM</th>`;
        // Coluna YoY
        html += `<th class="col-mes-yoy text-center ${refClass}" style="font-size:0.75rem; color:#aaa; padding: 4px 2px; white-space: nowrap;" title="YoY (Year-over-Year): Crescimento percentual em relação ao mesmo mês do ano anterior">YoY</th>`;
        
        if (isRef) {
            html += `<th class="col-ytd-yoy sortable text-center" onclick="sortTable('ytd_yoy')" style="background: rgba(255,193,7,0.1); color: var(--gold-light); font-size:0.8rem; padding: 4px 2px; white-space: nowrap;" title="YTD YoY (Year-to-Date Year-over-Year): Crescimento percentual do acumulado (Jan até M-1) em relação ao mesmo período do ano anterior">YTD YoY ↕</th>`;
        }
    });

    html += `
        <th class="col-share-periodo sortable text-right" onclick="sortTable('share_periodo')" title="Share Período: Participação % da categoria no total do período analisado">Share Per. ↕</th>
        <th class="col-share-ant sortable text-right" onclick="sortTable('share_periodo_ant')" title="Share Ano Anterior (A-1): Participação % da categoria no mesmo período do ano passado">Share A-1 ↕</th>
        <th class="col-share-var sortable text-right" onclick="sortTable('share_var')" title="Δ Share: Variação em pontos percentuais entre o Share atual e o do ano anterior">Δ Share ↕</th>
        <th class="col-status text-center" style="min-width: 90px; white-space: nowrap;" title="Status de performance da categoria">Status</th>
    `;

    theadRow.innerHTML = html;
}

function renderTable() {
    if (!currentData) return;

    renderTableHeader();

    const items = [...currentData.canais];
    const searchTerm = (document.getElementById('table-search')?.value || '').toLowerCase().trim();
    const allMeses = currentData.meses_colunas || [];
    const meses = allMeses.filter(m => selectedMonths.includes(m.num));
    const mesRef = currentData.mes;
    const ano = currentData.ano;

    // Calcular faturamento do período e total geral do período selecionado (ano atual e ano anterior)
    let totalPeriodoGeral = 0;
    let totalPeriodoAntGeral = 0;

    items.forEach(row => {
        let fatItem = 0;
        let fatItemAnt = 0;
        selectedMonths.forEach(m => {
            fatItem += (row.meses_dados?.[m]?.faturamento || 0);
            fatItemAnt += (row.meses_dados?.[m]?.faturamento_ant || 0);
        });
        row.fat_periodo = fatItem;
        row.fat_periodo_ant = fatItemAnt;
        totalPeriodoGeral += fatItem;
        totalPeriodoAntGeral += fatItemAnt;

        let ytd_atual = 0;
        let ytd_ant = 0;
        for(let i=1; i<=mesRef; i++) {
            ytd_atual += (row.meses_dados?.[i]?.faturamento || 0);
            ytd_ant += (row.meses_dados?.[i]?.faturamento_ant || 0);
        }
        row.ytd_yoy_val = ytd_ant > 0 ? ((ytd_atual / ytd_ant) - 1) * 100 : (ytd_atual > 0 ? 100 : 0);
    });

    items.forEach(row => {
        row.share_periodo = totalPeriodoGeral > 0 ? ((row.fat_periodo / totalPeriodoGeral) * 100) : 0;
        row.share_periodo_ant = totalPeriodoAntGeral > 0 ? ((row.fat_periodo_ant / totalPeriodoAntGeral) * 100) : 0;
        row.share_var = row.share_periodo - row.share_periodo_ant;
    });

    // Filtragem por busca
    const filtered = items.filter(it => it.item.toLowerCase().includes(searchTerm));

    // Ordenação
    filtered.sort((a, b) => {
        let valA, valB;
        if (currentSort.column === 'share_periodo') {
            valA = a.share_periodo ?? 0;
            valB = b.share_periodo ?? 0;
        } else if (currentSort.column === 'share_periodo_ant') {
            valA = a.share_periodo_ant ?? 0;
            valB = b.share_periodo_ant ?? 0;
        } else if (currentSort.column === 'share_var') {
            valA = a.share_var ?? 0;
            valB = b.share_var ?? 0;
        } else if (currentSort.column === 'ytd_yoy') {
            valA = a.ytd_yoy_val ?? -Infinity;
            valB = b.ytd_yoy_val ?? -Infinity;
        } else if (currentSort.column.startsWith('mes_')) {
            const mNum = parseInt(currentSort.column.replace('mes_', ''));
            const dataA = a.meses_dados?.[mNum] || {};
            const dataB = b.meses_dados?.[mNum] || {};

            if (currentMetric === 'mom') {
                valA = dataA.mom ?? -Infinity;
                valB = dataB.mom ?? -Infinity;
            } else if (currentMetric === 'yoy') {
                valA = dataA.yoy ?? -Infinity;
                valB = dataB.yoy ?? -Infinity;
            } else {
                valA = dataA.share ?? 0;
                valB = dataB.share ?? 0;
            }
        } else {
            valA = a[currentSort.column];
            valB = b[currentSort.column];
        }

        if (valA === null || valA === undefined) valA = currentSort.asc ? Infinity : -Infinity;
        if (valB === null || valB === undefined) valB = currentSort.asc ? Infinity : -Infinity;

        if (typeof valA === 'string') {
            return currentSort.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return currentSort.asc ? valA - valB : valB - valA;
    });

    const tbody = document.getElementById('table-body');
    if (!tbody) return;

    const totalCols = 20;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${totalCols}" style="text-align: center; padding: 30px; color: #8c93a0;">Nenhum registro encontrado.</td></tr>`;
        return;
    }

    if (meses.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${totalCols}" class="text-center" style="padding: 40px; color: var(--gold-light); font-size: 0.85rem;">
                    ⚠️ Nenhum mês selecionado no filtro. Marque os meses desejados no botão <strong>"📅 Filtrar Meses"</strong> acima.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(row => {
        let mesesHtml = '';
        meses.forEach(m => {
            const d = row.meses_dados?.[m.num] || {};
            const share = d.share || 0;
            const vlr = d.faturamento || 0;
            const mom = d.mom;
            const yoy = d.yoy;

            const isRef = m.num === mesRef;
            const refClass = isRef ? 'active-month-td' : '';
            const shareNegCls = share < 0 ? 'negative' : '';

            // Main column
            let cellContent = (share !== 0 || vlr > 0) ? `
                <div class="cell-month-box" style="flex-direction:row; justify-content:flex-end; padding:0; height:100%; border:none;">
                    <span class="cell-month-main ${shareNegCls}" style="font-size:0.95rem; margin:0;">${share.toFixed(1)}%</span>
                </div>
            ` : '<span class="cell-vazio">—</span>';
            mesesHtml += `<td class="col-mes-val text-right ${refClass}" style="border-left: 1px solid #475569; padding:4px 2px;">${cellContent}</td>`;

            // MoM column
            let momBadge = '<span class="cell-vazio">—</span>';
            if (mom !== null && mom !== undefined && vlr > 0) {
                const momCls = mom > 0 ? 'positive' : (mom < 0 ? 'negative' : 'neutral');
                momBadge = `<span class="pct-pill ${momCls}" style="display:inline-block; margin:0; font-size:0.75rem; padding: 2px 4px;">${formatPct(mom)}</span>`;
            }
            mesesHtml += `<td class="text-center ${refClass}" style="vertical-align:middle; padding:4px 2px;">${momBadge}</td>`;

            // YoY column
            let yoyBadge = '<span class="cell-vazio">—</span>';
            if (yoy !== null && yoy !== undefined && vlr > 0) {
                const yoyCls = yoy > 0 ? 'positive' : (yoy < 0 ? 'negative' : 'neutral');
                yoyBadge = `<span class="pct-pill ${yoyCls}" style="display:inline-block; margin:0; font-size:0.75rem; padding: 2px 4px;">${formatPct(yoy)}</span>`;
            }
            mesesHtml += `<td class="text-center ${refClass}" style="vertical-align:middle; padding:4px 2px;">${yoyBadge}</td>`;

            // YTD YoY (only after M-1)
            if (isRef) {
                let ytdBadge = '<span class="cell-vazio">—</span>';
                if (row.fat_periodo > 0 || row.fat_periodo_ant > 0) {
                    const ytdCls = row.ytd_yoy_val > 0 ? 'positive' : (row.ytd_yoy_val < 0 ? 'negative' : 'neutral');
                    ytdBadge = `<span class="pct-pill ${ytdCls}" style="display:inline-block; margin:0; font-weight:bold; border:1px solid currentColor; font-size:0.75rem; padding: 2px 4px;">${formatPct(row.ytd_yoy_val)}</span>`;
                }
                mesesHtml += `<td class="text-center" style="vertical-align:middle; background: rgba(255,193,7,0.05); padding:4px 2px;">${ytdBadge}</td>`;
            }
        });

        const sharePerVal = row.share_periodo || 0;
        const shareAntVal = row.share_periodo_ant || 0;
        const diffPp = row.share_var ?? (sharePerVal - shareAntVal);
        const diffSign = diffPp > 0 ? '+' : '';
        const diffArrow = diffPp > 0 ? '▲' : (diffPp < 0 ? '▼' : '—');
        const diffCls = diffPp > 0 ? 'up' : (diffPp < 0 ? 'down negative' : 'equal');

        const sharePerNegCls = sharePerVal < 0 ? 'negative' : '';
        const shareAntNegCls = shareAntVal < 0 ? 'negative' : '';

        const sharePerHtml = `
            <td class="col-share-periodo text-right" title="Share no período filtrado (${selectedMonths.length} meses): ${sharePerVal.toFixed(1)}% (${formatMoeda(row.fat_periodo)})">
                <div class="cell-share-periodo">
                    <span class="share-periodo-val ${sharePerNegCls}">${sharePerVal.toFixed(1)}%</span>
                </div>
            </td>
        `;

        const shareAntHtml = `
            <td class="col-share-ant text-right" title="Share no mesmo período do ano anterior (${selectedMonths.length} meses): ${shareAntVal.toFixed(1)}% (${formatMoeda(row.fat_periodo_ant)})\nVariação de Share: ${diffSign}${diffPp.toFixed(1)} p.p.">
                <div class="cell-share-ant">
                    <span class="share-ant-val ${shareAntNegCls}">${shareAntVal.toFixed(1)}%</span>
                </div>
            </td>
        `;

        const shareVarHtml = `
            <td class="col-share-var text-right" title="Comparativo de Share (Período Atual vs Ano Anterior): ${diffSign}${diffPp.toFixed(1)} p.p. (${sharePerVal.toFixed(1)}% vs ${shareAntVal.toFixed(1)}%)">
                <div class="cell-share-var">
                    <span class="var-share-pill ${diffCls}">${diffArrow} ${diffSign}${diffPp.toFixed(1)}%</span>
                </div>
            </td>
        `;

        return `
            <tr>
                <td class="col-rank text-center">${renderRankBadge(row.rank)}</td>
                <td class="col-item text-left" title="${row.item}" style="min-width: 180px; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${row.item}</td>
                ${mesesHtml}
                ${sharePerHtml}
                ${shareAntHtml}
                ${shareVarHtml}
                <td class="col-status text-center" style="min-width: 90px; white-space: nowrap;">${renderStatusTag(row.status)}</td>
            </tr>
        `;
    }).join('');

    // Atualizar stats badge
    const totalItensEl = document.getElementById('total-itens');
    const totalFatEl = document.getElementById('total-faturamento');
    if (totalItensEl) totalItensEl.innerText = filtered.length;
    if (totalFatEl && currentData) {
        totalFatEl.innerText = `${formatMoeda(currentData.total_faturamento)} [${currentData.mes_nome || 'M-1'}]`;
    }
}

function switchView(view) {
    currentView = view;
    const btnCat = document.getElementById('btn-view-cat');
    const btnMarca = document.getElementById('btn-view-marca');
    if (btnCat) btnCat.classList.toggle('active', view === 'categoria');
    if (btnMarca) btnMarca.classList.toggle('active', view === 'marca');

    if (currentData) {
        renderTable();
    }
}

function sortTable(column) {
    if (currentSort.column === column) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.column = column;
        currentSort.asc = (column === 'rank' || column === 'item');
    }
    renderTable();
}

function filterTable() {
    renderTable();
}

async function fetchData() {
    const hiddenMonthEl = document.getElementById('filter-month');
    const refMes = (selectedMonths && selectedMonths.length > 0) ? selectedMonths[selectedMonths.length - 1] : (hiddenMonthEl?.value || 8);
    const ano = document.getElementById('filter-year')?.value || 2026;

    try {
        const res = await fetch(`/api/categorias_dados?mes=${refMes}&ano=${ano}`);
        const json = await res.json();

        if (json.success && json.data) {
            currentData = json.data;
            renderTable();

            const lastEl = document.getElementById('last-update');
            if (lastEl) lastEl.innerText = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
        } else {
            console.error("Erro na API categorias_dados:", json.error);
        }
    } catch (err) {
        console.error("Falha ao buscar dados de categorias:", err);
    }
}

function manualRefresh() {
    nextUpdateSeconds = 600;
    fetchData();
}

function testarAudio() {
    const audioMusic = document.getElementById('music-sound');
    if (audioMusic) {
        audioMusic.currentTime = 0;
        if (window.tvRotator && window.tvRotator.pausarParaAudio) {
            window.tvRotator.pausarParaAudio('Van Halen - Jump');
        }
        audioMusic.onended = function () {
            if (window.tvRotator && window.tvRotator.retomarAposAudio) {
                window.tvRotator.retomarAposAudio();
            }
        };
        audioMusic.play().catch(e => console.log('Audio playback prevented:', e));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    updateClock();
    setInterval(updateClock, 1000);
    fetchData();
});
