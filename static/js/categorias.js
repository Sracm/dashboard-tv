let nextUpdateSeconds = 600;
let currentView = 'categoria'; // 'categoria' ou 'marca'
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
// Mes de corte do acumulado, lido do seletor #filter-month.
let selectedMonths = [];

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
    const marca = document.getElementById('filter-marca')?.value;
    let target = `${path}?mes=${mes}&ano=${ano}`;
    if (marca && marca !== 'TODAS') {
        target += `&marca=${encodeURIComponent(marca)}`;
    }
    window.location.href = target;
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

    // Mes de corte: da URL, senao o mes corrente. A tabela consolida
    // 01/01 ate o fim desse mes (ou ate hoje, se for o mes corrente).
    const mesParam = urlParams.get('mes');
    let mesCorte = parseInt(String(mesParam || '').split(',').pop());
    if (isNaN(mesCorte) || mesCorte < 1 || mesCorte > 12) {
        mesCorte = now.getMonth() + 1;
    }
    const monthEl = document.getElementById('filter-month');
    if (monthEl) monthEl.value = String(mesCorte);

    const marcaParam = urlParams.get('marca');
    if (marcaParam) {
        selectedMarcas = marcaParam.split(',').map(m => decodeURIComponent(m).trim()).filter(Boolean);
    }
}

// ---------------------------------------------------------------------------
// Filtro Multiselect de Marcas
// ---------------------------------------------------------------------------
let allAvailableMarcas = [];
let selectedMarcas = [];

function initMarcaMultiselect() {
    if (!currentData) return;

    if (currentData.marcas && currentData.marcas.length > 0) {
        allAvailableMarcas = currentData.marcas.map(m => m.item).filter(Boolean);
    }
    if (allAvailableMarcas.length === 0) {
        allAvailableMarcas = ['MQ PRO', 'PARLUX', 'FORCE BARB', 'MQ ESCOVAS', 'MQ BEAUTY', 'MQ TESOURA', 'MQ COMEX', 'FT1', 'DENMAN', 'TERMIX', 'OUTRAS'];
    }

    if (selectedMarcas.length === 0) {
        selectedMarcas = [...allAvailableMarcas];
    }

    const grid = document.getElementById('marca-checkbox-grid');
    if (!grid) return;
    grid.innerHTML = '';

    allAvailableMarcas.forEach((marca, idx) => {
        const isChecked = selectedMarcas.includes(marca);

        const item = document.createElement('label');
        item.className = `ms-item ${isChecked ? 'checked' : ''}`;
        item.id = `marca-item-${idx}`;
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'space-between';
        item.style.padding = '5px 8px';
        item.style.cursor = 'pointer';

        item.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" class="ms-checkbox" value="${escapeHtml(marca)}" ${isChecked ? 'checked' : ''} onchange="onMarcaCheckChange('${marca.replace(/'/g, "\\'")}', ${idx})">
                <span style="font-weight:600; font-size:0.75rem;">${escapeHtml(marca)}</span>
            </div>
        `;
        grid.appendChild(item);
    });

    updateMarcaSelectLabel();
}

function toggleMarcaDropdown(event) {
    if (event) event.stopPropagation();
    const wrapper = document.getElementById('marca-multiselect');
    if (wrapper) {
        wrapper.classList.toggle('open');
    }
}

function onMarcaCheckChange(marca, idx) {
    const exists = selectedMarcas.includes(marca);
    if (exists) {
        selectedMarcas = selectedMarcas.filter(m => m !== marca);
    } else {
        selectedMarcas.push(marca);
    }

    const item = document.getElementById(`marca-item-${idx}`);
    if (item) {
        item.classList.toggle('checked', !exists);
    }

    updateMarcaSelectLabel();
    fetchData();
}

function selectAllMarcas(all, event) {
    if (event) event.stopPropagation();
    if (all) {
        selectedMarcas = [...allAvailableMarcas];
    } else {
        selectedMarcas = [];
    }
    syncMarcaCheckboxUI();
    updateMarcaSelectLabel();
    fetchData();
}

function syncMarcaCheckboxUI() {
    allAvailableMarcas.forEach((marca, idx) => {
        const isChecked = selectedMarcas.includes(marca);
        const item = document.getElementById(`marca-item-${idx}`);
        if (item) {
            item.classList.toggle('checked', isChecked);
            const chk = item.querySelector('input');
            if (chk) chk.checked = isChecked;
        }
    });
}

function updateMarcaSelectLabel() {
    const labelEl = document.getElementById('marca-select-label');
    const badgeEl = document.getElementById('marca-count-badge');
    if (!labelEl) return;

    const total = allAvailableMarcas.length;
    const count = selectedMarcas.length;

    if (badgeEl) {
        badgeEl.innerText = `${count} de ${total} sel.`;
    }

    if (count === total || count === 0) {
        labelEl.innerText = 'Marcas: Todas';
    } else if (count === 1) {
        labelEl.innerText = `Marca: ${selectedMarcas[0]}`;
    } else {
        labelEl.innerText = `Marcas (${count})`;
    }
}

document.addEventListener('click', (e) => {
    const catWrapper = document.getElementById('cat-multiselect');
    if (catWrapper && catWrapper.classList.contains('open')) {
        if (!catWrapper.contains(e.target)) {
            catWrapper.classList.remove('open');
        }
    }
    const marcaWrapper = document.getElementById('marca-multiselect');
    if (marcaWrapper && marcaWrapper.classList.contains('open')) {
        if (!marcaWrapper.contains(e.target)) {
            marcaWrapper.classList.remove('open');
        }
    }
});








// ---------------------------------------------------------------------------
// Filtro Multiselect de Categorias:
// Padrão: todas as categorias exceto "Spare Parts" e "Outros"
// ---------------------------------------------------------------------------
let allAvailableCategories = [];
let selectedCategories = [];

function formatCategoryName(name) {
    if (!name) return '';
    const n = String(name).trim();
    const lower = n.toLowerCase();
    if (lower.includes('diario') || lower.includes('diário')) {
        return 'Escova/Diario';
    }
    if (lower.includes('secadora') || lower.includes('sec.')) {
        return 'Escova Sec.';
    }
    return n;
}

function isDefaultCategory(catName) {
    if (!catName) return false;
    const c = String(catName).toLowerCase().trim();
    // Exclui apenas "spare parts" e "outros"
    if (c === 'spare parts' || c.includes('spare') || c === 'outros' || c.includes('outro')) {
        return false;
    }
    return true;
}

function initCategoryMultiselect() {
    if (!currentData || !currentData.categorias) return;

    if (allAvailableCategories.length === 0) {
        allAvailableCategories = currentData.categorias.filter(c => !isItemZerado(c)).map(c => c.item);
    }

    // Se selectedCategories estiver vazio, inicializa com padrão (sem Spare Parts e Outros)
    if (selectedCategories.length === 0) {
        selectedCategories = allAvailableCategories.filter(isDefaultCategory);
    }

    const grid = document.getElementById('cat-checkbox-grid');
    if (!grid) return;
    grid.innerHTML = '';

    allAvailableCategories.forEach((cat, idx) => {
        const isChecked = selectedCategories.includes(cat);
        const isDef = isDefaultCategory(cat);

        const item = document.createElement('label');
        item.className = `ms-item ${isChecked ? 'checked' : ''}`;
        item.id = `cat-item-${idx}`;
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'space-between';
        item.style.padding = '5px 8px';
        item.style.cursor = 'pointer';

        item.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" class="ms-checkbox" value="${cat}" ${isChecked ? 'checked' : ''} onchange="onCategoryCheckChange('${cat.replace(/'/g, "\\'")}', ${idx})">
                <span style="font-weight:600; font-size:0.75rem;">${formatCategoryName(cat)}</span>
            </div>
            ${isDef ? '<span style="font-size:0.60rem; color:var(--gold); font-weight:800; background:rgba(203,151,39,0.15); padding:1px 5px; border-radius:3px;">PADRÃO</span>' : '<span style="font-size:0.60rem; color:#64748b; font-weight:600;">OPCIONAL</span>'}
        `;
        grid.appendChild(item);
    });

    updateCategorySelectLabel();
}

function toggleCatDropdown(event) {
    if (event) event.stopPropagation();
    const wrapper = document.getElementById('cat-multiselect');
    if (wrapper) {
        wrapper.classList.toggle('open');
    }
}

function onCategoryCheckChange(cat, idx) {
    const exists = selectedCategories.includes(cat);
    if (exists) {
        selectedCategories = selectedCategories.filter(c => c !== cat);
    } else {
        selectedCategories.push(cat);
    }

    const item = document.getElementById(`cat-item-${idx}`);
    if (item) {
        item.classList.toggle('checked', !exists);
    }

    updateCategorySelectLabel();
    renderTable();
}

function selectDefaultCategories(event) {
    if (event) event.stopPropagation();
    selectedCategories = allAvailableCategories.filter(isDefaultCategory);
    syncCategoryCheckboxUI();
    updateCategorySelectLabel();
    renderTable();
}

function selectAllCategories(all, event) {
    if (event) event.stopPropagation();
    if (all) {
        selectedCategories = [...allAvailableCategories];
    } else {
        selectedCategories = [];
    }
    syncCategoryCheckboxUI();
    updateCategorySelectLabel();
    renderTable();
}

function syncCategoryCheckboxUI() {
    allAvailableCategories.forEach((cat, idx) => {
        const isChecked = selectedCategories.includes(cat);
        const item = document.getElementById(`cat-item-${idx}`);
        if (item) {
            item.classList.toggle('checked', isChecked);
            const chk = item.querySelector('input');
            if (chk) chk.checked = isChecked;
        }
    });
}

function updateCategorySelectLabel() {
    const labelEl = document.getElementById('cat-select-label');
    const badgeEl = document.getElementById('cat-count-badge');
    const count = selectedCategories.length;
    const total = allAvailableCategories.length;

    if (badgeEl) badgeEl.innerText = `${count} sel.`;

    if (!labelEl) return;
    if (count === 0) {
        labelEl.innerText = 'Categorias: Nenhuma';
    } else if (count === total) {
        labelEl.innerText = 'Categorias: Todas';
    } else if (count === allAvailableCategories.filter(isDefaultCategory).length && allAvailableCategories.filter(isDefaultCategory).every(c => selectedCategories.includes(c))) {
        labelEl.innerText = `Categorias: Principais (${count})`;
    } else {
        labelEl.innerText = `Categorias (${count})`;
    }
}

// ---------------------------------------------------------------------------
// Funções auxiliares de formatação
// ---------------------------------------------------------------------------
function formatMoeda(val) {
    if (val === null || val === undefined || isNaN(val)) return 'R$ 0,00';
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPp(val, isSub = false) {
    if (val === null || val === undefined || isNaN(val)) return '<span class="var-share-pill equal">— 0,0 p.p.</span>';
    const num = Number(val);
    const subCls = isSub ? 'sub' : '';
    if (num > 0.0001) {
        return `<span class="var-share-pill up ${subCls}">▲ +${num.toFixed(1).replace('.', ',')} p.p.</span>`;
    }
    if (num < -0.0001) {
        return `<span class="var-share-pill down negative ${subCls}">▼ ${num.toFixed(1).replace('.', ',')} p.p.</span>`;
    }
    return `<span class="var-share-pill equal ${subCls}">— 0,0 p.p.</span>`;
}

function formatEvol(val, isSub = false) {
    if (val === null || val === undefined || isNaN(val)) return '<span class="var-share-pill equal">— 0,0%</span>';
    const num = Number(val);
    const subCls = isSub ? 'sub' : '';
    if (num > 0.0001) {
        return `<span class="var-share-pill up ${subCls}">▲ +${num.toFixed(1).replace('.', ',')}%</span>`;
    }
    if (num < -0.0001) {
        return `<span class="var-share-pill down negative ${subCls}">▼ ${num.toFixed(1).replace('.', ',')}%</span>`;
    }
    return `<span class="var-share-pill equal ${subCls}">— 0,0%</span>`;
}

function renderRankBadge(rank) {
    if (rank === 1) return `<span class="rank-badge rank-1">1º</span>`;
    if (rank === 2) return `<span class="rank-badge rank-2">2º</span>`;
    if (rank === 3) return `<span class="rank-badge rank-3">3º</span>`;
    return `<span class="rank-badge rank-other">${rank}º</span>`;
}

function switchMetric(met) {
    currentMetric = met;
    ['completo', 'share', 'mom', 'yoy'].forEach(m => {
        const btn = document.getElementById(`btn-met-${m}`);
        if (btn) btn.classList.toggle('active', m === met);
    });
    renderTable();
}

function rotuloPeriodo() {
    const c = currentData && currentData.contexto;
    if (!c) return '';
    const fim = c.periodos.ytd[1];
    const partes = fim.split('-');
    return `01/01 a ${partes[2]}/${partes[1]}${c.parcial ? ` · ${c.dias} dias` : ''}`;
}

function renderTableHeader() {
    const theadRow = document.getElementById('table-header-row');
    if (!theadRow || !currentData) return;

    const itemLabel = currentView === 'categoria' ? 'Categoria' : 'Marca';
    const ano = currentData.ano;

    theadRow.innerHTML = `
        <th class="col-rank sortable text-center" onclick="sortTable('rank')"># ↕</th>
        <th class="col-item sortable text-left" onclick="sortTable('item')" style="min-width: 180px; max-width: 260px;">${itemLabel} ↕</th>
        <th class="col-share-ant sortable text-right" onclick="sortTable('share_ant')" title="Participação no mesmo período do ano anterior">Share ${ano - 1} ↕</th>
        <th class="col-share-periodo sortable text-right" onclick="sortTable('share')" title="Participação no acumulado do ano atual">Share ${ano} ↕</th>
        <th class="col-share-pp sortable text-right" onclick="sortTable('evolucao_pp')" title="Variação em pontos percentuais (Share ${ano} - Share ${ano - 1})">Evolução p.p ↕</th>
        <th class="col-share-var sortable text-right" onclick="sortTable('evolucao_share')" title="Evolução percentual: (Share ${ano} - Share ${ano - 1}) / Share ${ano - 1}">Evolução ↕</th>
    `;
}

let collapsedCategories = new Set();

function toggleCategory(catName, event) {
    if (event) event.stopPropagation();
    if (collapsedCategories.has(catName)) {
        collapsedCategories.delete(catName);
    } else {
        collapsedCategories.add(catName);
    }
    renderTable();
}

function expandAllCategories() {
    collapsedCategories.clear();
    renderTable();
}

function collapseAllCategories() {
    if (!currentData) return;
    const items = currentView === 'categoria' ? currentData.categorias : currentData.marcas;
    items.forEach(c => collapsedCategories.add(c.item));
    renderTable();
}

let currentDisplayMode = 'cards'; // 'cards' (padrão) ou 'table'

function switchDisplayMode(mode) {
    currentDisplayMode = mode;
    const btnCards = document.getElementById('btn-mode-cards');
    const btnTable = document.getElementById('btn-mode-table');
    const containerCards = document.getElementById('container-cards');
    const containerTable = document.getElementById('container-table');
    const treeControls = document.getElementById('table-tree-controls');

    if (btnCards) btnCards.classList.toggle('active', mode === 'cards');
    if (btnTable) btnTable.classList.toggle('active', mode === 'table');

    if (containerCards) containerCards.style.display = mode === 'cards' ? 'grid' : 'none';
    if (containerTable) containerTable.style.display = mode === 'table' ? 'flex' : 'none';
    if (treeControls) treeControls.style.display = mode === 'table' ? 'flex' : 'none';

    if (mode === 'table') {
        renderTable();
    } else {
        setTimeout(initTableAutoScroll, 150);
    }
}
window.switchViewMode = switchDisplayMode;
window.switchDisplayMode = switchDisplayMode;

function isItemZerado(item) {
    if (!item) return true;
    const sAnt = Number(item.share_ant || 0);
    const sAtual = Number(item.share || 0);
    const pp = Math.abs(sAtual - sAnt);
    return sAnt < 0.05 && sAtual < 0.05 && pp < 0.05;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function cleanProductName(name, cat) {
    if (!name) return '';
    let s = String(name).trim();

    // Remove MQ do início
    s = s.replace(/^MQ\s+/i, '');

    // Se a categoria for Prancha, Secador, Modelador, etc., remove o prefixo redundante
    s = s.replace(/^PRANCHA\s+/i, '');
    s = s.replace(/^SECADOR\s+/i, '');
    s = s.replace(/^MODELADOR\s+/i, '');
    
    // Maquinas
    s = s.replace(/^MAQUINA\s+DE\s+CORTE\s+/i, 'CORTE ');
    s = s.replace(/^MAQUINA\s+DE\s+ACABAMENTO\s+/i, 'ACAB. ');
    s = s.replace(/^MAQUINA\s+/i, '');

    // Tesouras
    s = s.replace(/^TESOURAS?\s+SORTIDAS\s+/i, 'SORTIDAS ');
    s = s.replace(/^TESOURAS?\s+/i, '');
    s = s.replace(/^TES\s+/i, '');

    // Escovas Secadoras / Alisadoras
    s = s.replace(/^ESCOVA\s+SECADORA\s+/i, '');
    s = s.replace(/^ESCOVA\s+ALISADORA\s+/i, 'ALISADORA ');
    s = s.replace(/^ESCOVA\s+/i, '');
    s = s.replace(/\s*-\s*ESCOVA\s+SECADORA.*$/i, '');
    s = s.replace(/\s*-\s*ESCOVA\s+ALISADORA.*$/i, '');

    // Sufixos redundantes de código/voltagem no final
    s = s.replace(/\s*-\s*MQ\d+$/i, ''); // Ex: - MQ203, - MQ196
    s = s.replace(/\s*-\s*BIVOLT$/i, ' BIV');
    s = s.replace(/\s*BIVOLT$/i, ' BIV');
    
    // Encurtar termos longos de tesoura e produtos
    s = s.replace(/DESBASTADEIRA/gi, 'DESBAST.');
    s = s.replace(/SAND\s+FINISH/gi, 'SAND');
    s = s.replace(/SHINE\s+STEEL/gi, 'SHINE');
    s = s.replace(/TITANIUM/gi, 'TIT.');

    return s.trim();
}

function getCategoryPriority(item) {
    if (!item) return 99;
    const s = String(item).toLowerCase();
    if (s.includes('prancha')) return 1;
    if (s.includes('secador')) return 2;
    if (s.includes('maquina')) return 3;
    if (s.includes('diario') || s.includes('diário')) return 4;
    if (s.includes('modelador')) return 5;
    if (s.includes('parlux')) return 6;
    if (s.includes('secadora') || s.includes('sec.')) return 7;
    if (s.includes('tesoura')) return 8;
    return 99;
}

function renderCategoryCard(cat, rankNum) {
    const anoAtual = currentData ? currentData.ano : 2026;
    const anoAnt = anoAtual - 1;
    const shareAnt = cat.share_ant ?? 0;
    const shareAtual = cat.share ?? 0;
    const catPp = shareAtual - shareAnt;
    let catEvol = shareAnt > 0 ? ((shareAtual - shareAnt) / shareAnt) * 100 : (shareAtual > 0 ? 100.0 : 0.0);

    // Se a evolução p.p for igual a 0.0 p.p, NÃO mostrar no card para não poluir
    const showCatPp = Math.abs(catPp) >= 0.05;

    // Filtrar produtos relevantes que NÃO sejam zerados (share ant, share atual e evolução p.p zerados)
    const prods = (cat.produtos || []).filter(p => !isItemZerado(p));
    const topProds = prods;

    const rankClass = rankNum === 1 ? 'rank-1-card' : '';
    const rankBadge = renderRankBadge(rankNum);

    const prodItemsHtml = topProds.length > 0 ? topProds.map((p, pIdx) => {
        const pShareAnt = p.share_ant ?? 0;
        const pShareAtual = p.share ?? 0;
        const pPp = pShareAtual - pShareAnt;
        const cleanName = cleanProductName(p.item, cat.item);

        // Cálculo da Evolução % do share (ex: (28.7 - 25.6) / 25.6 = +12.1%)
        let pEvol = p.evolucao_share;
        if (pEvol === null || pEvol === undefined || isNaN(pEvol)) {
            if (pShareAnt > 0) {
                pEvol = ((pShareAtual - pShareAnt) / pShareAnt) * 100;
            } else if (pShareAtual > 0) {
                pEvol = 100.0;
            } else {
                pEvol = 0.0;
            }
        }

        let evolClass = 'equal';
        let evolText = '0,0%';
        if (pEvol > 0.05) {
            evolClass = 'up';
            evolText = `+${pEvol.toFixed(1).replace('.', ',')}%`;
        } else if (pEvol < -0.05) {
            evolClass = 'down negative';
            evolText = `${pEvol.toFixed(1).replace('.', ',')}%`;
        }

        const pPpFormatted = `${pPp >= 0 ? '+' : ''}${pPp.toFixed(1).replace('.', ',')} p.p.`;

        return `
            <div class="cat-col-prod-item" title="${escapeHtml(p.item)} | 2025: ${pShareAnt.toFixed(1).replace('.', ',')}% | 2026: ${pShareAtual.toFixed(1).replace('.', ',')}% | %Evol: ${evolText} | Dif: ${pPpFormatted}">
                <div class="cat-col-prod-top">
                    <span class="cat-col-prod-num">${pIdx + 1}º</span>
                    <span class="cat-col-prod-name" title="${escapeHtml(p.item)}">${escapeHtml(cleanName)}</span>
                </div>
                <div class="cat-col-prod-metrics">
                    <div class="prod-metric-col">
                        <span class="prod-m-lbl">${anoAnt}</span>
                        <span class="prod-m-val ant">${pShareAnt.toFixed(1).replace('.', ',')}%</span>
                    </div>
                    <div class="prod-metric-col">
                        <span class="prod-m-lbl gold">${anoAtual}</span>
                        <span class="prod-m-val atual">${pShareAtual.toFixed(1).replace('.', ',')}%</span>
                    </div>
                    <div class="prod-metric-col">
                        <span class="prod-m-lbl">%Evol.</span>
                        <span class="prod-m-val ${evolClass}">${evolText}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('') : `<div style="text-align:center; padding:12px 4px; color:#64748b; font-size:0.62rem;">Nenhum produto com evolução no período</div>`;

    const footerText = `${prods.length} ${prods.length === 1 ? 'produto com evolução' : 'produtos com evolução'}`;

    return `
        <div class="cat-column-card ${rankClass}">
            <div class="cat-col-header">
                <div class="cat-col-title-row">
                    ${rankBadge}
                    <span class="cat-col-name" title="${escapeHtml(cat.item)}">${formatCategoryName(cat.item)}</span>
                    <span class="cat-col-prod-count">${prods.length}p</span>
                </div>
            </div>

            <div class="cat-col-hero">
                <div class="cat-hero-shares-grid">
                    <div class="cat-hero-share-box">
                        <span class="cat-hero-share-lbl">SHARE ${anoAnt}</span>
                        <span class="cat-hero-share-num ant">${shareAnt.toFixed(1).replace('.', ',')}%</span>
                    </div>
                    <div class="cat-hero-share-divider"></div>
                    <div class="cat-hero-share-box">
                        <span class="cat-hero-share-lbl gold">SHARE ${anoAtual}</span>
                        <span class="cat-hero-share-num atual">${shareAtual.toFixed(1).replace('.', ',')}%</span>
                    </div>
                </div>

                <div class="cat-hero-evols-row">
                    ${showCatPp ? `
                        <div class="cat-hero-evol-cell">
                            <span class="cat-hero-evol-lbl">EVOL. P.P</span>
                            <span class="var-share-pill ${catPp > 0 ? 'up' : 'down'}">
                                ${catPp > 0 ? '▲ +' : '▼ '}${Math.abs(catPp).toFixed(1).replace('.', ',')} p.p.
                            </span>
                        </div>
                    ` : ''}
                    <div class="cat-hero-evol-cell">
                        <span class="cat-hero-evol-lbl">EVOLUÇÃO</span>
                        <span class="var-share-pill ${catEvol > 0 ? 'up' : (catEvol < 0 ? 'down' : 'equal')}">
                            ${catEvol > 0 ? '▲ +' : (catEvol < 0 ? '▼ ' : '')}${Math.abs(catEvol).toFixed(1).replace('.', ',')}%
                        </span>
                    </div>
                </div>
            </div>

            <div class="cat-col-body">
                <div class="cat-col-prods-title">
                    <span>TOP PRODUTOS</span>
                    <span>2025 · 2026 · %EVOL</span>
                </div>
                <div class="cat-col-prod-list">
                    ${prodItemsHtml}
                </div>
            </div>

            <div class="cat-col-footer">
                <span>${footerText}</span>
            </div>
        </div>
    `;
}

function renderCards(filteredCats) {
    const container = document.getElementById('container-cards');
    if (!container) return;

    // Ocultar categorias zeradas
    const activeCats = (filteredCats || []).filter(c => !isItemZerado(c));

    if (activeCats.length === 0) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align:center; padding:50px; color:#8c93a0; font-size:1rem;">Nenhuma categoria com movimentação encontrada no filtro.</div>`;
        return;
    }

    // Ordenação das 2 linhas:
    // Linha 1 (maior volume): Prancha, Secador, Máquina, Escova Diário
    // Linha 2 (foco/menores): Modelador, Parlux, Escova Sec., Tesoura
    const sortedCats = [...activeCats].sort((a, b) => getCategoryPriority(a.item) - getCategoryPriority(b.item));

    if (sortedCats.length <= 4) {
        container.style.gridTemplateColumns = `repeat(${sortedCats.length}, minmax(0, 1fr))`;
        container.style.gridTemplateRows = '1fr';
    } else {
        container.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
        container.style.gridTemplateRows = 'repeat(2, minmax(0, 1fr))';
    }

    const cardsHtml = sortedCats.map((cat, idx) => {
        return renderCategoryCard(cat, idx + 1);
    }).join('');

    container.innerHTML = cardsHtml;
}

function renderTable() {
    if (!currentData) return;

    renderTableHeader();

    // Filtrar itens que NÃO sejam zerados (share ant, share atual e evolução p.p = 0)
    let items = (currentView === 'categoria' ? [...currentData.categorias] : [...currentData.marcas]).filter(c => !isItemZerado(c));

    // Respeita o multiselect de categorias
    if (currentView === 'categoria') {
        if (selectedCategories.length > 0) {
            items = items.filter(c => selectedCategories.includes(c.item));
        } else if (allAvailableCategories.length > 0 && selectedCategories.length === 0) {
            items = [];
        }
    }

    const searchTerm = (document.getElementById('table-search')?.value || '').toLowerCase().trim();

    // Filtragem por busca: busca na categoria ou em seus produtos
    let filtered = [];
    if (!searchTerm) {
        filtered = items;
    } else {
        items.forEach(cat => {
            const catMatches = cat.item.toLowerCase().includes(searchTerm);
            const activeProds = (cat.produtos || []).filter(p => !isItemZerado(p));
            const matchingProds = activeProds.filter(p => p.item.toLowerCase().includes(searchTerm));
            if (catMatches || matchingProds.length > 0) {
                filtered.push({
                    ...cat,
                    produtos: catMatches ? activeProds : matchingProds
                });
            }
        });
    }

    filtered.sort((a, b) => {
        let valA, valB;
        if (currentSort.column === 'evolucao_pp') {
            const shA = a.share ?? 0, shAntA = a.share_ant ?? 0;
            const shB = b.share ?? 0, shAntB = b.share_ant ?? 0;
            valA = shA - shAntA;
            valB = shB - shAntB;
        } else if (currentSort.column === 'evolucao_share') {
            const shA = a.share ?? 0, shAntA = a.share_ant ?? 0;
            const shB = b.share ?? 0, shAntB = b.share_ant ?? 0;
            valA = shAntA > 0 ? ((shA - shAntA) / shAntA * 100) : (shA > 0 ? 100 : 0);
            valB = shAntB > 0 ? ((shB - shAntB) / shAntB * 100) : (shB > 0 ? 100 : 0);
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

    // Renderiza as 7 Colunas Lado a Lado
    renderCards(filtered);

    const tbody = document.getElementById('table-body');
    const tfoot = document.getElementById('table-footer');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:#8c93a0;">Nenhum registro encontrado.</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const htmlRows = [];

    filtered.forEach((cat, catIdx) => {
        const isCollapsed = collapsedCategories.has(cat.item);
        const prods = (cat.produtos || []).filter(p => !isItemZerado(p));
        const expandIcon = isCollapsed ? '▶' : '▼';

        const shareAnt = cat.share_ant ?? 0;
        const shareAtual = cat.share ?? 0;
        
        // 1. Evolução p.p = Share 2026 - Share 2025
        const catPp = shareAtual - shareAnt;

        // 2. Evolução %: (Share 2026 - Share 2025) / Share 2025
        let catEvol = 0;
        if (shareAnt > 0) {
            catEvol = ((shareAtual - shareAnt) / shareAnt) * 100;
        } else if (shareAtual > 0) {
            catEvol = 100.0;
        } else {
            catEvol = 0.0;
        }

        const safeCatItem = cat.item.replace(/'/g, "\\'");

        // 1. LINHA DA CATEGORIA
        htmlRows.push(`
            <tr class="cat-header-row ${isCollapsed ? 'collapsed' : ''}" onclick="toggleCategory('${safeCatItem}', event)" title="Clique para expandir/recolher produtos desta categoria">
                <td class="col-rank text-center">${renderRankBadge(catIdx + 1)}</td>
                <td class="col-item text-left" style="min-width: 180px; max-width: 260px;">
                    <div class="cat-item-content">
                        <span class="cat-toggle-icon">${expandIcon}</span>
                        <span class="cat-title-text">${formatCategoryName(cat.item)}</span>
                        <span class="cat-count-pill">${prods.length} ${prods.length === 1 ? 'prod' : 'prods'}</span>
                    </div>
                </td>
                <td class="col-share-ant text-right cat-share-ant"><span class="share-ant-val">${shareAnt.toFixed(1).replace('.', ',')}%</span></td>
                <td class="col-share-periodo text-right cat-share-periodo"><span class="share-periodo-val" style="font-weight:700; color:#ffd700;">${shareAtual.toFixed(1).replace('.', ',')}%</span></td>
                <td class="col-share-pp text-right">${formatPp(catPp)}</td>
                <td class="col-share-var text-right">${formatEvol(catEvol)}</td>
            </tr>
        `);

        // 2. LINHAS DOS PRODUTOS ABAIXO DA CATEGORIA
        if (!isCollapsed && prods.length > 0) {
            prods.forEach((prod, pIdx) => {
                const prodShareAnt = prod.share_ant ?? 0;
                const prodShareAtual = prod.share ?? 0;
                
                // 1. Evolução p.p
                const prodPp = prodShareAtual - prodShareAnt;

                // 2. Evolução %: (Share 2026 - Share 2025) / Share 2025
                let prodEvol = 0;
                if (prodShareAnt > 0) {
                    prodEvol = ((prodShareAtual - prodShareAnt) / prodShareAnt) * 100;
                } else if (prodShareAtual > 0) {
                    prodEvol = 100.0;
                } else {
                    prodEvol = 0.0;
                }

                htmlRows.push(`
                    <tr class="prod-sub-row">
                        <td class="col-rank text-center prod-rank-cell">
                            <span class="prod-sub-num">${pIdx + 1}º</span>
                        </td>
                        <td class="col-item text-left prod-item-cell" title="${prod.item}" style="min-width: 180px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            <div class="prod-indent-wrap">
                                <span class="prod-name-label">${prod.item}</span>
                            </div>
                        </td>
                        <td class="col-share-ant text-right prod-share-cell"><span class="sub-share-muted">${prodShareAnt.toFixed(1).replace('.', ',')}%</span></td>
                        <td class="col-share-periodo text-right prod-share-cell"><span class="sub-share-light" style="color:#ffd700;">${prodShareAtual.toFixed(1).replace('.', ',')}%</span></td>
                        <td class="col-share-pp text-right">${formatPp(prodPp, true)}</td>
                        <td class="col-share-var text-right">${formatEvol(prodEvol, true)}</td>
                    </tr>
                `);
            });
        }
    });

    tbody.innerHTML = htmlRows.join('');

    // Linha de TOTAL das categorias visíveis
    if (tfoot) {
        const sumShareAnt = filtered.reduce((acc, r) => acc + (r.share_ant || 0), 0);
        const sumShareAtual = filtered.reduce((acc, r) => acc + (r.share || 0), 0);
        const sumPp = sumShareAtual - sumShareAnt;
        const sumEvol = sumShareAnt > 0 ? ((sumShareAtual - sumShareAnt) / sumShareAnt) * 100 : 0;

        tfoot.innerHTML = `
            <tr class="total-row">
                <td class="col-rank text-center" style="font-size:0.9rem;">Σ</td>
                <td class="col-item text-left">TOTAL SELECIONADO</td>
                <td class="col-share-ant text-right total-share"><span class="share-ant-val">${sumShareAnt.toFixed(1).replace('.', ',')}%</span></td>
                <td class="col-share-periodo text-right total-share"><span class="share-periodo-val" style="color:#ffd700;">${sumShareAtual.toFixed(1).replace('.', ',')}%</span></td>
                <td class="col-share-pp text-right">${formatPp(sumPp)}</td>
                <td class="col-share-var text-right">${formatEvol(sumEvol)}</td>
            </tr>
        `;
    }

    const totalItensEl = document.getElementById('total-itens');
    if (totalItensEl) totalItensEl.innerText = filtered.length;

    setTimeout(initTableAutoScroll, 150);
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

async function fetchData(forceRefresh = false) {
    const monthEl = document.getElementById('filter-month');
    const refMes = parseInt(monthEl?.value) || (new Date().getMonth() + 1);
    const ano = document.getElementById('filter-year')?.value || 2026;

    try {
        let url = `/api/categorias_dados?mes=${refMes}&ano=${ano}`;
        if (selectedMarcas.length > 0 && selectedMarcas.length < allAvailableMarcas.length) {
            url += `&marca=${encodeURIComponent(selectedMarcas.join(','))}`;
        }
        if (forceRefresh) {
            url += `&refresh=1&_t=${Date.now()}`;
        }
        const res = await fetch(url);
        const json = await res.json();

        if (json.success && json.data) {
            currentData = json.data;
            initCategoryMultiselect();
            initMarcaMultiselect();
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

// ── Auto-Scroll Contínuo nas Tabelas e Cards (Modo TV) ───────────────────
const activeScrollIntervals = [];

function initTableAutoScroll() {
    activeScrollIntervals.forEach(timer => clearInterval(timer));
    activeScrollIntervals.length = 0;

    const scrollEls = document.querySelectorAll('.table-responsive-wrapper, .cat-col-body, .columns-grid-container, .tv-table-scroll');
    scrollEls.forEach(container => {
        let isPaused = false;
        let resumeTimeout = null;

        container.addEventListener('mouseenter', () => { isPaused = true; });
        container.addEventListener('mouseleave', () => { isPaused = false; });
        container.addEventListener('touchstart', () => { isPaused = true; }, { passive: true });
        container.addEventListener('touchend',   () => { isPaused = false; }, { passive: true });
        container.addEventListener('wheel', () => {
            isPaused = true;
            clearTimeout(resumeTimeout);
            resumeTimeout = setTimeout(() => { isPaused = false; }, 3000);
        }, { passive: true });

        const interval = setInterval(() => {
            if (isPaused) return;

            const maxScroll = container.scrollHeight - container.clientHeight;
            if (maxScroll <= 5) return;

            container.scrollTop += 0.8;
            if (container.scrollTop >= maxScroll - 2) {
                isPaused = true;
                setTimeout(() => {
                    container.scrollTo({ top: 0, behavior: 'smooth' });
                    setTimeout(() => { isPaused = false; }, 1200);
                }, 2500);
            }
        }, 35);

        activeScrollIntervals.push(interval);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    updateClock();
    setInterval(updateClock, 1000);
    fetchData();
    setTimeout(initTableAutoScroll, 300);
});
