let nextUpdateSeconds = 600;
let currentView = 'marca'; // 'categoria' ou 'marca'
let currentMetric = 'completo'; // 'completo', 'share', 'mom', 'yoy'
let currentData = null;
let currentSort = { column: 'rank', asc: true };
let currentCanaisSort = { column: 'rank', asc: true };
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

// Marcas padrão solicitadas
const DEFAULT_BRANDS = [
    'MQ PRO',
    'MQ COMEX',
    'PARLUX',
    'FORCE BARB',
    'MQ ESCOVAS',
    'MQ BEAUTY',
    'MQ TESOURA'
];

let selectedBrands = [...DEFAULT_BRANDS];
let allAvailableBrands = [];

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
    const brandWrapper = document.getElementById('brand-multiselect');
    if (brandWrapper && brandWrapper.classList.contains('open')) {
        if (!brandWrapper.contains(e.target)) {
            brandWrapper.classList.remove('open');
        }
    }
});

function isDefaultBrand(brandName) {
    const b = (brandName || '').toUpperCase().trim();
    return DEFAULT_BRANDS.some(def => {
        const d = def.toUpperCase().trim();
        return b === d || (d.includes('TESOURA') && b.includes('TESOURA')) || (d.includes('FORCE') && b.includes('FORCE'));
    });
}

function initBrandMultiselect() {
    if (!currentData || !currentData.marcas) return;

    allAvailableBrands = currentData.marcas.map(m => m.item);

    // Se selectedBrands estiver vazio, inicializa com as 7 marcas padrão solicitadas
    if (selectedBrands.length === 0) {
        selectedBrands = allAvailableBrands.filter(isDefaultBrand);
    }

    const grid = document.getElementById('brand-checkbox-grid');
    if (!grid) return;
    grid.innerHTML = '';

    allAvailableBrands.forEach((marca, idx) => {
        const mUpper = marca.toUpperCase().trim();
        const isChecked = selectedBrands.some(b => {
            const bUpper = b.toUpperCase().trim();
            return bUpper === mUpper || (bUpper.includes('TESOURA') && mUpper.includes('TESOURA'));
        });

        const isDef = isDefaultBrand(marca);

        const item = document.createElement('label');
        item.className = `ms-item ${isChecked ? 'checked' : ''}`;
        item.id = `brand-item-${idx}`;
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'space-between';
        item.style.padding = '5px 8px';
        item.style.cursor = 'pointer';

        item.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" class="ms-checkbox" value="${marca}" ${isChecked ? 'checked' : ''} onchange="onBrandCheckChange('${marca}', ${idx})">
                <span style="font-weight:600; font-size:0.75rem;">${marca}</span>
            </div>
            ${isDef ? '<span style="font-size:0.60rem; color:var(--gold); font-weight:800; background:rgba(203,151,39,0.15); padding:1px 5px; border-radius:3px;">PADRÃO</span>' : ''}
        `;
        grid.appendChild(item);
    });

    updateBrandSelectLabel();
}

function toggleBrandDropdown(event) {
    if (event) event.stopPropagation();
    const wrapper = document.getElementById('brand-multiselect');
    const monthWrapper = document.getElementById('month-multiselect');
    if (monthWrapper) monthWrapper.classList.remove('open');
    if (wrapper) {
        wrapper.classList.toggle('open');
    }
}

function onBrandCheckChange(marca, idx) {
    const mUpper = marca.toUpperCase().trim();
    const exists = selectedBrands.some(b => {
        const bUpper = b.toUpperCase().trim();
        return bUpper === mUpper || (bUpper.includes('TESOURA') && mUpper.includes('TESOURA'));
    });

    if (exists) {
        selectedBrands = selectedBrands.filter(b => {
            const bUpper = b.toUpperCase().trim();
            return !(bUpper === mUpper || (bUpper.includes('TESOURA') && mUpper.includes('TESOURA')));
        });
    } else {
        selectedBrands.push(marca);
    }

    const item = document.getElementById(`brand-item-${idx}`);
    if (item) {
        item.classList.toggle('checked', !exists);
    }

    updateBrandSelectLabel();
    renderTable();
}

function selectDefaultBrands(event) {
    if (event) event.stopPropagation();
    selectedBrands = allAvailableBrands.filter(isDefaultBrand);
    syncBrandCheckboxUI();
    updateBrandSelectLabel();
    renderTable();
}

function selectAllBrands(all, event) {
    if (event) event.stopPropagation();
    if (all) {
        selectedBrands = [...allAvailableBrands];
    } else {
        selectedBrands = [];
    }
    syncBrandCheckboxUI();
    updateBrandSelectLabel();
    renderTable();
}

function syncBrandCheckboxUI() {
    allAvailableBrands.forEach((marca, idx) => {
        const mUpper = marca.toUpperCase().trim();
        const isChecked = selectedBrands.some(b => {
            const bUpper = b.toUpperCase().trim();
            return bUpper === mUpper || (bUpper.includes('TESOURA') && mUpper.includes('TESOURA'));
        });
        const item = document.getElementById(`brand-item-${idx}`);
        if (item) {
            item.classList.toggle('checked', isChecked);
            const chk = item.querySelector('input');
            if (chk) chk.checked = isChecked;
        }
    });
}

function updateBrandSelectLabel() {
    const labelEl = document.getElementById('brand-select-label');
    const badgeEl = document.getElementById('brand-count-badge');
    const count = selectedBrands.length;

    if (badgeEl) badgeEl.innerText = `${count} sel.`;
    if (!labelEl) return;

    if (count === 0) {
        labelEl.innerText = 'Nenhuma marca';
    } else if (allAvailableBrands.length > 0 && count === allAvailableBrands.length) {
        labelEl.innerText = 'Todas as marcas';
    } else if (count === 7 && selectedBrands.every(isDefaultBrand)) {
        labelEl.innerText = 'Marcas: Principais (7)';
    } else if (count <= 2) {
        labelEl.innerText = selectedBrands.join(', ');
    } else {
        labelEl.innerText = `Marcas: ${count} selecionadas`;
    }
}

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
        <th class="col-item sortable text-left" onclick="sortTable('item')">${itemLabel} ↕</th>
    `;

    meses.forEach(m => {
        const isRef = m.num === mesRef;
        const refClass = isRef ? 'active-month-th' : '';
        const refTag = isRef ? ' <span class="ref-badge">M-1 Fechado</span>' : '';

        let subLabel = '';
        if (currentMetric === 'share') subLabel = ' (Share)';
        else if (currentMetric === 'mom') subLabel = ' (MoM)';
        else if (currentMetric === 'yoy') subLabel = ' (YoY)';

        html += `<th class="col-mes-header sortable text-right ${refClass}" onclick="sortTable('mes_${m.num}')">${m.label}${subLabel}${refTag} ↕</th>`;
    });

    html += `
        <th class="col-share-periodo sortable text-right" onclick="sortTable('share_periodo')">Share Per. ↕</th>
        <th class="col-share-ant sortable text-right" onclick="sortTable('share_periodo_ant')">Share A-1 ↕</th>
        <th class="col-share-var sortable text-right" onclick="sortTable('share_var')">Δ Share ↕</th>
        <th class="col-status text-center">Status</th>
    `;

    theadRow.innerHTML = html;
}

function renderMarcasTable() {
    if (!currentData) return;

    renderTableHeader();

    let items = currentView === 'categoria' ? [...currentData.categorias] : [...currentData.marcas];

    // Filtrar apenas as marcas selecionadas no filtro de marcas (padrão: 7 principais)
    if (currentView === 'marca') {
        if (!selectedBrands || selectedBrands.length === 0) {
            items = [];
        } else {
            items = items.filter(it => {
                const itUpper = (it.item || '').toUpperCase().trim();
                return selectedBrands.some(b => {
                    const bUpper = b.toUpperCase().trim();
                    return itUpper === bUpper || (bUpper.includes('TESOURA') && itUpper.includes('TESOURA')) || (bUpper.includes('FORCE') && itUpper.includes('FORCE'));
                });
            });
        }
    }

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

    const totalCols = 3 + meses.length + 2;

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
            const delta = d.delta_rank;
            const mom = d.mom;
            const yoy = d.yoy;
            const rank = d.rank;

            const isRef = m.num === mesRef;
            const refClass = isRef ? 'active-month-td' : '';

            // Tooltip completo
            const deltaDesc = delta > 0 ? `subiu ${delta} posições` : (delta < 0 ? `caiu ${Math.abs(delta)} posições` : 'manteve a posição');
            const tooltip = `${m.label}/${ano}
• Faturamento: ${formatMoeda(vlr)}
• Share no Mês: ${share.toFixed(1)}%
• Posição: #${rank || '—'} (${deltaDesc})
• MoM: ${formatPct(mom)} vs mês anterior
• YoY: ${formatPct(yoy)} vs mesmo mês ano anterior`;

            let cellContent = '';

            if (currentMetric === 'completo') {
                let deltaBadge = '';
                if (delta !== null && delta !== undefined) {
                    if (delta > 0) deltaBadge = `<span class="delta-badge-sm up" title="Subiu ${delta} posições">▲${delta}</span>`;
                    else if (delta < 0) deltaBadge = `<span class="delta-badge-sm down" title="Caiu ${Math.abs(delta)} posições">▼${Math.abs(delta)}</span>`;
                    else deltaBadge = `<span class="delta-badge-sm equal" title="Manteve a posição">—</span>`;
                }

                let momBadge = '';
                if (mom !== null && mom !== undefined && vlr > 0) {
                    const momCls = mom > 0 ? 'positive' : (mom < 0 ? 'negative' : 'neutral');
                    momBadge = `<span class="metric-pill ${momCls}" title="MoM: ${formatPct(mom)}">MoM ${formatPct(mom)}</span>`;
                }

                let yoyBadge = '';
                if (yoy !== null && yoy !== undefined && vlr > 0) {
                    const yoyCls = yoy > 0 ? 'positive' : (yoy < 0 ? 'negative' : 'neutral');
                    yoyBadge = `<span class="metric-pill ${yoyCls}" title="YoY: ${formatPct(yoy)}">YoY ${formatPct(yoy)}</span>`;
                }

                const shareNegCls = share < 0 ? 'negative' : '';
                cellContent = (share !== 0 || vlr > 0) ? `
                    <div class="cell-month-box">
                        <div class="cell-month-top">
                            <span class="cell-month-main ${shareNegCls}">${share.toFixed(1)}%</span>
                            ${deltaBadge}
                        </div>
                        <div class="cell-month-metrics">
                            ${momBadge}
                            ${yoyBadge}
                        </div>
                    </div>
                ` : '<span class="cell-vazio">—</span>';

            } else if (currentMetric === 'share') {
                const shareNegCls = share < 0 ? 'negative' : '';
                cellContent = (share !== 0 || vlr > 0) ? `<span class="cell-month-main ${shareNegCls}">${share.toFixed(1)}%</span>` : '<span class="cell-vazio">—</span>';

            } else if (currentMetric === 'mom') {
                const momCls = mom > 0 ? 'positive' : (mom < 0 ? 'negative' : 'neutral');
                cellContent = (mom !== null && mom !== undefined && vlr > 0) ? `<span class="pct-pill ${momCls}">${formatPct(mom)}</span>` : '<span class="cell-vazio">—</span>';

            } else if (currentMetric === 'yoy') {
                const yoyCls = yoy > 0 ? 'positive' : (yoy < 0 ? 'negative' : 'neutral');
                cellContent = (yoy !== null && yoy !== undefined && vlr > 0) ? `<span class="pct-pill ${yoyCls}">${formatPct(yoy)}</span>` : '<span class="cell-vazio">—</span>';
            }

            mesesHtml += `<td class="col-mes-val text-right ${refClass}" title="${tooltip}">${cellContent}</td>`;
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
                <td class="col-item text-left">${row.item}</td>
                ${mesesHtml}
                ${sharePerHtml}
                ${shareAntHtml}
                ${shareVarHtml}
                <td class="col-status text-center">${renderStatusTag(row.status)}</td>
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

function renderCanaisTableHeader() {
    const theadRow = document.getElementById('table-canais-header-row');
    if (!theadRow || !currentData) return;

    const allMeses = currentData.meses_colunas || [];
    const meses = allMeses.filter(m => selectedMonths.includes(m.num));
    const mesRef = currentData.mes;

    let html = `
        <th class="col-rank sortable text-center" onclick="sortCanaisTable('rank')"># ↕</th>
        <th class="col-item sortable text-left" onclick="sortCanaisTable('item')">Canal de Vendas ↕</th>
    `;

    meses.forEach(m => {
        const isRef = m.num === mesRef;
        const refClass = isRef ? 'active-month-th' : '';
        const refTag = isRef ? ' <span class="ref-badge">M-1 Fechado</span>' : '';

        let subLabel = '';
        if (currentMetric === 'share') subLabel = ' (Share)';
        else if (currentMetric === 'mom') subLabel = ' (MoM)';
        else if (currentMetric === 'yoy') subLabel = ' (YoY)';

        html += `<th class="col-mes-header sortable text-right ${refClass}" onclick="sortCanaisTable('mes_${m.num}')">${m.label}${subLabel}${refTag} ↕</th>`;
    });

    html += `
        <th class="col-share-periodo sortable text-right" onclick="sortCanaisTable('share_periodo')">Share Per. ↕</th>
        <th class="col-share-ant sortable text-right" onclick="sortCanaisTable('share_periodo_ant')">Share A-1 ↕</th>
        <th class="col-share-var sortable text-right" onclick="sortCanaisTable('share_var')">Δ Share ↕</th>
        <th class="col-status text-center">Status</th>
    `;

    theadRow.innerHTML = html;
}

function renderCanaisTable() {
    if (!currentData || !currentData.canais) return;

    renderCanaisTableHeader();

    let items = currentData.canais.map(c => JSON.parse(JSON.stringify(c)));

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
        if (currentCanaisSort.column === 'share_periodo') {
            valA = a.share_periodo ?? 0;
            valB = b.share_periodo ?? 0;
        } else if (currentCanaisSort.column === 'share_periodo_ant') {
            valA = a.share_periodo_ant ?? 0;
            valB = b.share_periodo_ant ?? 0;
        } else if (currentCanaisSort.column === 'share_var') {
            valA = a.share_var ?? 0;
            valB = b.share_var ?? 0;
        } else if (currentCanaisSort.column.startsWith('mes_')) {
            const mNum = parseInt(currentCanaisSort.column.replace('mes_', ''));
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
            valA = a[currentCanaisSort.column];
            valB = b[currentCanaisSort.column];
        }

        if (valA === null || valA === undefined) valA = currentCanaisSort.asc ? Infinity : -Infinity;
        if (valB === null || valB === undefined) valB = currentCanaisSort.asc ? Infinity : -Infinity;

        if (typeof valA === 'string') {
            return currentCanaisSort.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return currentCanaisSort.asc ? valA - valB : valB - valA;
    });

    const tbody = document.getElementById('table-canais-body');
    if (!tbody) return;

    const totalCols = 3 + meses.length + 2;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${totalCols}" style="text-align: center; padding: 25px; color: #8c93a0;">Nenhum canal encontrado.</td></tr>`;
        return;
    }

    if (meses.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${totalCols}" class="text-center" style="padding: 30px; color: var(--gold-light); font-size: 0.85rem;">
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
            const delta = d.delta_rank;
            const mom = d.mom;
            const yoy = d.yoy;
            const rank = d.rank;

            const isRef = m.num === mesRef;
            const refClass = isRef ? 'active-month-td' : '';

            const deltaDesc = delta > 0 ? `subiu ${delta} posições` : (delta < 0 ? `caiu ${Math.abs(delta)} posições` : 'manteve a posição');
            const tooltip = `${m.label}/${ano} - ${row.item}
• Faturamento: ${formatMoeda(vlr)}
• Share no Mês: ${share.toFixed(1)}%
• Posição: #${rank || '—'} (${deltaDesc})
• MoM: ${formatPct(mom)} vs mês anterior
• YoY: ${formatPct(yoy)} vs mesmo mês ano anterior`;

            let cellContent = '';

            if (currentMetric === 'completo') {
                let deltaBadge = '';
                if (delta !== null && delta !== undefined) {
                    if (delta > 0) deltaBadge = `<span class="delta-badge-sm up" title="Subiu ${delta} posições">▲${delta}</span>`;
                    else if (delta < 0) deltaBadge = `<span class="delta-badge-sm down" title="Caiu ${Math.abs(delta)} posições">▼${Math.abs(delta)}</span>`;
                    else deltaBadge = `<span class="delta-badge-sm equal" title="Manteve a posição">—</span>`;
                }

                let momBadge = '';
                if (mom !== null && mom !== undefined && vlr > 0) {
                    const momCls = mom > 0 ? 'positive' : (mom < 0 ? 'negative' : 'neutral');
                    momBadge = `<span class="metric-pill ${momCls}" title="MoM: ${formatPct(mom)}">MoM ${formatPct(mom)}</span>`;
                }

                let yoyBadge = '';
                if (yoy !== null && yoy !== undefined && vlr > 0) {
                    const yoyCls = yoy > 0 ? 'positive' : (yoy < 0 ? 'negative' : 'neutral');
                    yoyBadge = `<span class="metric-pill ${yoyCls}" title="YoY: ${formatPct(yoy)}">YoY ${formatPct(yoy)}</span>`;
                }

                const shareNegCls = share < 0 ? 'negative' : '';
                cellContent = (share !== 0 || vlr > 0) ? `
                    <div class="cell-month-box">
                        <div class="cell-month-top">
                            <span class="cell-month-main ${shareNegCls}">${share.toFixed(1)}%</span>
                            ${deltaBadge}
                        </div>
                        <div class="cell-month-metrics">
                            ${momBadge}
                            ${yoyBadge}
                        </div>
                    </div>
                ` : '<span class="cell-vazio">—</span>';

            } else if (currentMetric === 'share') {
                const shareNegCls = share < 0 ? 'negative' : '';
                cellContent = (share !== 0 || vlr > 0) ? `<span class="cell-month-main ${shareNegCls}">${share.toFixed(1)}%</span>` : '<span class="cell-vazio">—</span>';

            } else if (currentMetric === 'mom') {
                const momCls = mom > 0 ? 'positive' : (mom < 0 ? 'negative' : 'neutral');
                cellContent = (mom !== null && mom !== undefined && vlr > 0) ? `<span class="pct-pill ${momCls}">${formatPct(mom)}</span>` : '<span class="cell-vazio">—</span>';

            } else if (currentMetric === 'yoy') {
                const yoyCls = yoy > 0 ? 'positive' : (yoy < 0 ? 'negative' : 'neutral');
                cellContent = (yoy !== null && yoy !== undefined && vlr > 0) ? `<span class="pct-pill ${yoyCls}">${formatPct(yoy)}</span>` : '<span class="cell-vazio">—</span>';
            }

            mesesHtml += `<td class="col-mes-val text-right ${refClass}" title="${tooltip}">${cellContent}</td>`;
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
                <td class="col-item text-left" style="font-weight: 700;">${row.item}</td>
                ${mesesHtml}
                ${sharePerHtml}
                ${shareAntHtml}
                ${shareVarHtml}
                <td class="col-status text-center">${renderStatusTag(row.status)}</td>
            </tr>
        `;
    }).join('');
}

function sortCanaisTable(column) {
    if (currentCanaisSort.column === column) {
        currentCanaisSort.asc = !currentCanaisSort.asc;
    } else {
        currentCanaisSort.column = column;
        currentCanaisSort.asc = (column === 'rank' || column === 'item');
    }
    renderCanaisTable();
}

function renderTable() {
    renderMarcasTable();
    renderCanaisTable();
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
    renderMarcasTable();
}

function filterTable() {
    renderMarcasTable();
    renderCanaisTable();
}

async function fetchData(forceRefresh = false) {
    const hiddenMonthEl = document.getElementById('filter-month');
    const refMes = (selectedMonths && selectedMonths.length > 0) ? selectedMonths[selectedMonths.length - 1] : (hiddenMonthEl?.value || 8);
    const ano = document.getElementById('filter-year')?.value || 2026;

    try {
        const refreshParam = forceRefresh ? '&refresh=1' : '';
        const res = await fetch(`/api/categorias_dados?mes=${refMes}&ano=${ano}${refreshParam}`);
        const json = await res.json();

        if (json.success && json.data) {
            currentData = json.data;
            initBrandMultiselect();
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
    fetchData(true);
}

function testarAudio() {
    const audioSiren = document.getElementById('victory-sound');
    const audioMusic = document.getElementById('music-sound');
    if (audioSiren) {
        audioSiren.currentTime = 0;
        audioSiren.play().catch(e => console.log('Audio playback prevented:', e));
        setTimeout(() => {
            audioSiren.pause();
            audioSiren.currentTime = 0;
            if (audioMusic) {
                audioMusic.currentTime = 0;
                audioMusic.play().catch(e => console.log('Audio playback prevented:', e));
                setTimeout(() => {
                    audioMusic.pause();
                    audioMusic.currentTime = 0;
                }, 10000);
            }
        }, 10000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    updateClock();
    setInterval(updateClock, 1000);
    fetchData();
});
