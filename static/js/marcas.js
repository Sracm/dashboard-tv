let nextUpdateSeconds = 600;
let currentView = 'marca';
let currentMetric = 'completo';
let currentData = null;
let currentSort = { column: 'rank', asc: true };
const nomesMeses = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Marcas padrão executivas solicitadas (7 principais)
const DEFAULT_BRANDS = [
    'MQ PRO',
    'PARLUX',
    'FORCE BARB',
    'MQ ESCOVAS',
    'MQ BEAUTY',
    'MQ TESOURA',
    'MQ COMEX'
];

let selectedBrands = [];
let allAvailableBrands = [];
let collapsedMarcas = new Set();
let currentDisplayMode = 'cards'; // 'cards' (padrão) ou 'table'

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

    const mesParam = urlParams.get('mes');
    let mesCorte = parseInt(String(mesParam || '').split(',').pop());
    if (isNaN(mesCorte) || mesCorte < 1 || mesCorte > 12) {
        mesCorte = now.getMonth() + 1;
    }
    const monthEl = document.getElementById('filter-month');
    if (monthEl) monthEl.value = String(mesCorte);

    const marcaParam = urlParams.get('marca');
    if (marcaParam) {
        selectedBrands = marcaParam.split(',').map(m => decodeURIComponent(m).trim()).filter(Boolean);
    }
}

// ---------------------------------------------------------------------------
// Filtro Multiselect de Marcas
// ---------------------------------------------------------------------------
function isDefaultBrand(brandName) {
    if (!brandName) return false;
    const b = brandName.toUpperCase().trim();
    return DEFAULT_BRANDS.some(def => {
        const d = def.toUpperCase().trim();
        return b === d || (d.includes('TESOURA') && b.includes('TESOURA')) || (d.includes('FORCE') && b.includes('FORCE'));
    });
}

function initBrandMultiselect() {
    if (!currentData || !currentData.marcas) return;

    if (allAvailableBrands.length === 0) {
        allAvailableBrands = currentData.marcas.filter(m => !isItemZerado(m)).map(m => m.item).filter(Boolean);
    }

    if (selectedBrands.length === 0) {
        selectedBrands = allAvailableBrands.filter(isDefaultBrand);
        if (selectedBrands.length === 0) {
            selectedBrands = [...allAvailableBrands];
        }
    }

    const grid = document.getElementById('brand-checkbox-grid');
    if (!grid) return;
    grid.innerHTML = '';

    allAvailableBrands.forEach((marca, idx) => {
        const isChecked = selectedBrands.includes(marca);
        const isDef = isDefaultBrand(marca);

        const item = document.createElement('label');
        item.className = `ms-item ${isChecked ? 'checked' : ''}`;
        item.id = `brand-item-${idx}`;
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'space-between';
        item.style.padding = '5px 8px';
        item.style.cursor = 'pointer';

        const safeMarca = marca.replace(/'/g, "\\'");

        item.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" class="ms-checkbox" value="${escapeHtml(marca)}" ${isChecked ? 'checked' : ''} onchange="onBrandCheckChange('${safeMarca}', ${idx})">
                <span style="font-weight:600; font-size:0.75rem;">${escapeHtml(marca)}</span>
            </div>
            ${isDef ? '<span style="font-size:0.60rem; color:var(--gold); font-weight:800; background:rgba(203,151,39,0.15); padding:1px 5px; border-radius:3px;">PADRÃO</span>' : '<span style="font-size:0.60rem; color:#64748b; font-weight:600;">OPCIONAL</span>'}
        `;
        grid.appendChild(item);
    });

    updateBrandSelectLabel();
}

function toggleBrandDropdown(event) {
    if (event) event.stopPropagation();
    const wrapper = document.getElementById('brand-multiselect');
    if (wrapper) {
        wrapper.classList.toggle('open');
    }
}

function onBrandCheckChange(marca, idx) {
    const exists = selectedBrands.includes(marca);
    if (exists) {
        selectedBrands = selectedBrands.filter(m => m !== marca);
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
        const isChecked = selectedBrands.includes(marca);
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
    const total = allAvailableBrands.length;

    if (badgeEl) badgeEl.innerText = `${count} sel.`;

    if (!labelEl) return;
    if (count === 0) {
        labelEl.innerText = 'Marcas: Nenhuma';
    } else if (count === total) {
        labelEl.innerText = 'Marcas: Todas';
    } else if (count === allAvailableBrands.filter(isDefaultBrand).length && allAvailableBrands.filter(isDefaultBrand).every(b => selectedBrands.includes(b))) {
        labelEl.innerText = `Marcas: Principais (${count})`;
    } else {
        labelEl.innerText = `Marcas (${count})`;
    }
}

document.addEventListener('click', (e) => {
    const brandWrapper = document.getElementById('brand-multiselect');
    if (brandWrapper && brandWrapper.classList.contains('open')) {
        if (!brandWrapper.contains(e.target)) {
            brandWrapper.classList.remove('open');
        }
    }
});

// ---------------------------------------------------------------------------
// Formatação e Helpers
// ---------------------------------------------------------------------------
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

function cleanProductName(name, brand) {
    if (!name) return '';
    let s = String(name).trim();

    // Remove redundância da marca no nome do produto
    if (brand) {
        const b = String(brand).trim();
        const regexBrand = new RegExp(`(^|\\s*-\\s*|\\s+)${b.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(\\s*-\\s*|\\s+|$)`, 'gi');
        s = s.replace(regexBrand, ' ');
    }

    s = s.replace(/^MQ\s+/i, '');
    s = s.replace(/^PARLUX\s+/i, '');
    s = s.replace(/^FORCE\s+BARB(ER)?\s+/i, '');
    s = s.replace(/^TESOURAS?\s+SORTIDAS\s+/i, 'SORTIDAS ');
    s = s.replace(/^TESOURAS?\s+/i, '');
    s = s.replace(/^TES\s+/i, '');

    // Sufixos redundantes de código/voltagem no final
    s = s.replace(/\s*-\s*MQ\d+$/i, '');
    s = s.replace(/\s*-\s*BIVOLT$/i, ' BIV');
    s = s.replace(/\s*BIVOLT$/i, ' BIV');

    // Encurtar termos longos
    s = s.replace(/DESBASTADEIRA/gi, 'DESBAST.');
    s = s.replace(/SAND\s+FINISH/gi, 'SAND');
    s = s.replace(/SHINE\s+STEEL/gi, 'SHINE');
    s = s.replace(/TITANIUM/gi, 'TIT.');

    return s.replace(/\s+/g, ' ').trim();
}

function getBrandPriority(item) {
    if (!item) return 99;
    const s = String(item).toUpperCase().trim();
    if (s === 'MQ PRO') return 1;
    if (s === 'PARLUX') return 2;
    if (s === 'FORCE BARB' || s.includes('FORCE')) return 3;
    if (s === 'MQ ESCOVAS' || (s.includes('ESCOVA') && s.includes('MQ'))) return 4;
    if (s === 'MQ BEAUTY' || s.includes('BEAUTY')) return 5;
    if (s === 'MQ TESOURA' || s.includes('TESOURA')) return 6;
    if (s === 'MQ COMEX' || s.includes('COMEX')) return 7;
    if (s === 'FT1') return 8;
    return 99;
}

// ---------------------------------------------------------------------------
// Renderização dos Cards Lado a Lado (Modo 1)
// ---------------------------------------------------------------------------
function renderBrandCard(marca, rankNum) {
    const anoAtual = currentData ? currentData.ano : 2026;
    const anoAnt = anoAtual - 1;
    const shareAnt = marca.share_ant ?? 0;
    const shareAtual = marca.share ?? 0;
    const marcaPp = shareAtual - shareAnt;
    let marcaEvol = shareAnt > 0 ? ((shareAtual - shareAnt) / shareAnt) * 100 : (shareAtual > 0 ? 100.0 : 0.0);

    const showMarcaPp = Math.abs(marcaPp) >= 0.05;

    // Filtra produtos relevantes que NÃO sejam zerados
    const prods = (marca.produtos || []).filter(p => !isItemZerado(p));
    const topProds = prods;

    const rankClass = rankNum === 1 ? 'rank-1-card' : '';
    const rankBadge = renderRankBadge(rankNum);

    const prodItemsHtml = topProds.length > 0 ? topProds.map((p, pIdx) => {
        const pShareAnt = p.share_ant ?? 0;
        const pShareAtual = p.share ?? 0;
        const pPp = pShareAtual - pShareAnt;
        const cleanName = cleanProductName(p.item, marca.item);

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
            <div class="cat-col-prod-item" title="${escapeHtml(p.item)} | ${anoAnt}: ${pShareAnt.toFixed(1).replace('.', ',')}% | ${anoAtual}: ${pShareAtual.toFixed(1).replace('.', ',')}% | %Evol: ${evolText} | Dif: ${pPpFormatted}">
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
                    <span class="cat-col-name" title="${escapeHtml(marca.item)}">${escapeHtml(marca.item)}</span>
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
                    ${showMarcaPp ? `
                        <div class="cat-hero-evol-cell">
                            <span class="cat-hero-evol-lbl">EVOL. P.P</span>
                            <span class="var-share-pill ${marcaPp > 0 ? 'up' : 'down'}">
                                ${marcaPp > 0 ? '▲ +' : '▼ '}${Math.abs(marcaPp).toFixed(1).replace('.', ',')} p.p.
                            </span>
                        </div>
                    ` : ''}
                    <div class="cat-hero-evol-cell">
                        <span class="cat-hero-evol-lbl">EVOLUÇÃO</span>
                        <span class="var-share-pill ${marcaEvol > 0 ? 'up' : (marcaEvol < 0 ? 'down' : 'equal')}">
                            ${marcaEvol > 0 ? '▲ +' : (marcaEvol < 0 ? '▼ ' : '')}${Math.abs(marcaEvol).toFixed(1).replace('.', ',')}%
                        </span>
                    </div>
                </div>
            </div>

            <div class="cat-col-body">
                <div class="cat-col-prods-title">
                    <span>TOP PRODUTOS</span>
                    <span>${anoAnt} · ${anoAtual} · %EVOL</span>
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

function renderCards(filteredMarcas) {
    const container = document.getElementById('container-cards');
    if (!container) return;

    // Ocultar marcas zeradas
    const activeMarcas = (filteredMarcas || []).filter(m => !isItemZerado(m));

    if (activeMarcas.length === 0) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align:center; padding:50px; color:#8c93a0; font-size:1rem;">Nenhuma marca com movimentação encontrada no filtro.</div>`;
        return;
    }

    // Ordenação executiva: prioridade das marcas padrão
    const sortedMarcas = [...activeMarcas].sort((a, b) => getBrandPriority(a.item) - getBrandPriority(b.item));

    if (sortedMarcas.length <= 4) {
        container.style.gridTemplateColumns = `repeat(${sortedMarcas.length}, minmax(0, 1fr))`;
        container.style.gridTemplateRows = '1fr';
    } else {
        container.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
        container.style.gridTemplateRows = 'repeat(2, minmax(0, 1fr))';
    }

    const cardsHtml = sortedMarcas.map((marca, idx) => {
        return renderBrandCard(marca, idx + 1);
    }).join('');

    container.innerHTML = cardsHtml;
}

// ---------------------------------------------------------------------------
// Visualização e Controles de Tabela
// ---------------------------------------------------------------------------
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

function toggleMarca(brandName, event) {
    if (event) event.stopPropagation();
    if (collapsedMarcas.has(brandName)) {
        collapsedMarcas.delete(brandName);
    } else {
        collapsedMarcas.add(brandName);
    }
    renderTable();
}

function expandAllMarcas() {
    collapsedMarcas.clear();
    renderTable();
}

function collapseAllMarcas() {
    if (!currentData || !currentData.marcas) return;
    currentData.marcas.forEach(m => collapsedMarcas.add(m.item));
    renderTable();
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

function renderTableHeader() {
    const theadRow = document.getElementById('table-header-row');
    if (!theadRow || !currentData) return;

    const ano = currentData.ano;

    theadRow.innerHTML = `
        <th class="col-rank sortable text-center" onclick="sortTable('rank')"># ↕</th>
        <th class="col-item sortable text-left" onclick="sortTable('item')" style="min-width: 180px; max-width: 260px;">Marca ↕</th>
        <th class="col-share-ant sortable text-right" onclick="sortTable('share_ant')" title="Participação no mesmo período do ano anterior">Share ${ano - 1} ↕</th>
        <th class="col-share-periodo sortable text-right" onclick="sortTable('share')" title="Participação no acumulado do ano atual">Share ${ano} ↕</th>
        <th class="col-share-pp sortable text-right" onclick="sortTable('evolucao_pp')" title="Variação em pontos percentuais (Share ${ano} - Share ${ano - 1})">Evolução p.p ↕</th>
        <th class="col-share-var sortable text-right" onclick="sortTable('evolucao_share')" title="Evolução percentual: (Share ${ano} - Share ${ano - 1}) / Share ${ano - 1}">Evolução ↕</th>
    `;
}

// ---------------------------------------------------------------------------
// Renderização Principal (Cards + Tabela)
// ---------------------------------------------------------------------------
function renderTable() {
    if (!currentData || !currentData.marcas) return;

    renderTableHeader();

    // Filtrar marcas que NÃO sejam zeradas (share ant, share atual e evolução p.p = 0)
    let items = [...currentData.marcas].filter(m => !isItemZerado(m));

    // Respeita multiselect de marcas
    if (selectedBrands.length > 0) {
        items = items.filter(m => selectedBrands.includes(m.item));
    } else if (allAvailableBrands.length > 0 && selectedBrands.length === 0) {
        items = [];
    }

    const searchTerm = (document.getElementById('table-search')?.value || '').toLowerCase().trim();

    let filtered = [];
    if (!searchTerm) {
        filtered = items;
    } else {
        items.forEach(marca => {
            const marcaMatches = marca.item.toLowerCase().includes(searchTerm);
            const activeProds = (marca.produtos || []).filter(p => !isItemZerado(p));
            const matchingProds = activeProds.filter(p => p.item.toLowerCase().includes(searchTerm));
            if (marcaMatches || matchingProds.length > 0) {
                filtered.push({
                    ...marca,
                    produtos: marcaMatches ? activeProds : matchingProds
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

    // Renderiza Cards Lado a Lado
    renderCards(filtered);

    // Renderiza Tabela Detalhada
    const tbody = document.getElementById('table-body');
    const tfoot = document.getElementById('table-footer');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:#8c93a0;">Nenhum registro encontrado.</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const htmlRows = [];

    filtered.forEach((marca, mIdx) => {
        const isCollapsed = collapsedMarcas.has(marca.item);
        const prods = (marca.produtos || []).filter(p => !isItemZerado(p));
        const expandIcon = isCollapsed ? '▶' : '▼';

        const shareAnt = marca.share_ant ?? 0;
        const shareAtual = marca.share ?? 0;
        const marcaPp = shareAtual - shareAnt;

        let marcaEvol = 0;
        if (shareAnt > 0) {
            marcaEvol = ((shareAtual - shareAnt) / shareAnt) * 100;
        } else if (shareAtual > 0) {
            marcaEvol = 100.0;
        } else {
            marcaEvol = 0.0;
        }

        const safeMarcaItem = marca.item.replace(/'/g, "\\'");

        // Linha Principal da Marca
        htmlRows.push(`
            <tr class="cat-header-row ${isCollapsed ? 'collapsed' : ''}" onclick="toggleMarca('${safeMarcaItem}', event)" title="Clique para expandir/recolher produtos desta marca">
                <td class="col-rank text-center">${renderRankBadge(mIdx + 1)}</td>
                <td class="col-item text-left" style="min-width: 180px; max-width: 260px;">
                    <div class="cat-item-content">
                        <span class="cat-toggle-icon">${expandIcon}</span>
                        <span class="cat-title-text">${escapeHtml(marca.item)}</span>
                        <span class="cat-count-pill">${prods.length} ${prods.length === 1 ? 'prod' : 'prods'}</span>
                    </div>
                </td>
                <td class="col-share-ant text-right cat-share-ant"><span class="share-ant-val">${shareAnt.toFixed(1).replace('.', ',')}%</span></td>
                <td class="col-share-periodo text-right cat-share-periodo"><span class="share-periodo-val" style="font-weight:700; color:#ffd700;">${shareAtual.toFixed(1).replace('.', ',')}%</span></td>
                <td class="col-share-pp text-right">${formatPp(marcaPp)}</td>
                <td class="col-share-var text-right">${formatEvol(marcaEvol)}</td>
            </tr>
        `);

        // Linhas de Produtos abaixo da Marca
        if (!isCollapsed && prods.length > 0) {
            prods.forEach((prod, pIdx) => {
                const prodShareAnt = prod.share_ant ?? 0;
                const prodShareAtual = prod.share ?? 0;
                const prodPp = prodShareAtual - prodShareAnt;

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
                        <td class="col-item text-left prod-item-cell" title="${escapeHtml(prod.item)}" style="min-width: 180px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            <div class="prod-indent-wrap">
                                <span class="prod-name-label">${escapeHtml(prod.item)}</span>
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

    // Linha de TOTAL no rodapé
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
    setTimeout(initTableAutoScroll, 150);
}

// ---------------------------------------------------------------------------
// Carga de Dados da API
// ---------------------------------------------------------------------------
async function fetchData(forceRefresh = false) {
    const monthEl = document.getElementById('filter-month');
    const refMes = parseInt(monthEl?.value) || (new Date().getMonth() + 1);
    const ano = document.getElementById('filter-year')?.value || 2026;

    try {
        let url = `/api/categorias_dados?mes=${refMes}&ano=${ano}`;
        if (forceRefresh) {
            url += `&refresh=1&_t=${Date.now()}`;
        }
        const res = await fetch(url);
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
        console.error("Falha ao buscar dados de marcas:", err);
    }
}

function manualRefresh() {
    nextUpdateSeconds = 600;
    fetchData(true);
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
