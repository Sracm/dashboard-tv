/**
 * DASHBOARD PAÍSES (COMEX) — MQ HAIR
 * Implementação idêntica ao padrão de Canais / Categorias:
 * - Modo Cards (Colunas Lado a Lado) com Top Produtos por País
 * - Modo Tabela Detalhada com hierarquia e expansão de produtos
 * - Colunas limpas: Rank, País/Produto, Share 2025, Share 2026, Evol. p.p., Evolução % (sem MoM, YoY, YTD, Status)
 * - Filtros multiselect de Países e Marcas + Busca rápida
 */

let currentData = null;
let currentSort = { column: 'share', asc: false };
let collapsedPaises = new Set();
let viewMode = 'cards'; // 'cards' ou 'table'
let allAvailableMarcas = [];
let selectedMarcas = [];
let allAvailablePaises = [];
let selectedPaises = [];

// Mapeamento de bandeiras/ícones por país
const countryIcons = {
    'ESTADOS UNIDOS': '🇺🇸', 'USA': '🇺🇸',
    'MEXICO': '🇲🇽', 'MÉXICO': '🇲🇽',
    'PORTUGAL': '🇵🇹',
    'PARAGUAI': '🇵🇾', 'PARAGUAY': '🇵🇾',
    'URUGUAI': '🇺🇾', 'URUGUAY': '🇺🇾',
    'ARGENTINA': '🇦🇷',
    'CHILE': '🇨🇱',
    'COLOMBIA': '🇨🇴', 'COLÔMBIA': '🇨🇴',
    'BOLIVIA': '🇧🇴', 'BOLÍVIA': '🇧🇴',
    'PERU': '🇵🇪',
    'EQUADOR': '🇪🇨',
    'ESPANHA': '🇪🇸',
    'ITALIA': '🇮🇹', 'ITÁLIA': '🇮🇹',
    'FRANCA': '🇫🇷', 'FRANÇA': '🇫🇷',
    'ALEMANHA': '🇩🇪',
    'REINO UNIDO': '🇬🇧',
    'PANAMA': '🇵🇦', 'PANAMÁ': '🇵🇦',
    'COSTA RICA': '🇨🇷',
    'GUATEMALA': '🇬🇹',
    'HONDURAS': '🇭🇳',
    'EMIRADOS ARABES': '🇦🇪', 'EMIRADOS ÁRABES': '🇦🇪',
    'JAPAO': '🇯🇵', 'JAPÃO': '🇯🇵',
    'CHINA': '🇨🇳',
    'CANADA': '🇨🇦', 'CANADÁ': '🇨🇦',
    'AUSTRALIA': '🇦🇺', 'AUSTRÁLIA': '🇦🇺',
    'ANGOLA': '🇦🇴',
    'MOCAMBIQUE': '🇲🇿', 'MOÇAMBIQUE': '🇲🇿',
    'SUIÇA': '🇨🇭', 'SUICA': '🇨🇭',
    'ISRAEL': '🇮🇱',
    'TURQUIA': '🇹🇷',
    'INDIA': '🇮🇳', 'ÍNDIA': '🇮🇳',
    'RUSSIA': '🇷🇺', 'RÚSSIA': '🇷🇺'
};

function getCountryFlag(name) {
    if (!name) return '🌐';
    const upper = name.toUpperCase().trim();
    return countryIcons[upper] || '🌐';
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

function formatMoney(val) {
    if (val === null || val === undefined || isNaN(val)) return 'R$ 0,00';
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function formatCompactMoney(val) {
    if (val === null || val === undefined || isNaN(val)) return 'R$ 0';
    const num = Number(val);
    if (Math.abs(num) >= 1000000) return `R$ ${(num / 1000000).toFixed(1).replace('.', ',')}M`;
    if (Math.abs(num) >= 1000) return `R$ ${(num / 1000).toFixed(0)}k`;
    return `R$ ${num.toFixed(0)}`;
}

function formatPp(val, isSub = false) {
    if (val === null || val === undefined || isNaN(val)) return `<span class="val-neutral">—</span>`;
    const n = Number(val);
    if (Math.abs(n) < 0.05) return `<span class="val-neutral">0,0 p.p</span>`;
    const sign = n > 0 ? '+' : '';
    const cls = n > 0 ? 'val-positive' : 'val-negative';
    const badgeCls = isSub ? 'pp-badge-sub' : 'pp-badge';
    return `<span class="${badgeCls} ${cls}">${sign}${n.toFixed(1).replace('.', ',')} p.p</span>`;
}

function formatEvol(val, isSub = false) {
    if (val === null || val === undefined || isNaN(val)) return `<span class="val-neutral">—</span>`;
    const n = Number(val);
    if (Math.abs(n) < 0.05) return `<span class="val-neutral">0,0%</span>`;
    const sign = n > 0 ? '+' : '';
    const cls = n > 0 ? 'val-positive' : 'val-negative';
    const arrow = n > 0 ? '▲' : '▼';
    const badgeCls = isSub ? 'evol-badge-sub' : 'evol-badge';
    return `<span class="${badgeCls} ${cls}">${arrow} ${sign}${n.toFixed(1).replace('.', ',')}%</span>`;
}

function renderRankBadge(rank) {
    if (rank === 1) return `<span class="rank-badge rank-gold">1º</span>`;
    if (rank === 2) return `<span class="rank-badge rank-silver">2º</span>`;
    if (rank === 3) return `<span class="rank-badge rank-bronze">3º</span>`;
    return `<span class="rank-badge rank-normal">${rank}º</span>`;
}

// ---------------------------------------------------------------------------
// Inicialização e Navegação
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);

    const now = new Date();
    const currentMonth = now.getDate() <= 3 ? (now.getMonth() === 0 ? 12 : now.getMonth()) : now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const mSelect = document.getElementById('filter-month');
    const ySelect = document.getElementById('filter-year');
    if (mSelect) mSelect.value = String(currentMonth);
    if (ySelect) ySelect.value = String(currentYear);

    // Fechar dropdowns ao clicar fora
    document.addEventListener('click', (e) => {
        const marcaWrapper = document.getElementById('marca-multiselect');
        const paisWrapper = document.getElementById('pais-multiselect');
        if (marcaWrapper && !marcaWrapper.contains(e.target)) {
            document.getElementById('marca-select-menu')?.classList.remove('show');
        }
        if (paisWrapper && !paisWrapper.contains(e.target)) {
            document.getElementById('pais-select-menu')?.classList.remove('show');
        }
    });

    fetchData();

    // Auto-refresh a cada 10 minutos
    setInterval(() => fetchData(), 10 * 60 * 1000);
});

function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('date');
    if (clockEl) clockEl.innerText = now.toLocaleTimeString('pt-BR');
    if (dateEl) dateEl.innerText = now.toLocaleDateString('pt-BR');
}

function navigateTab(url) {
    const mes = document.getElementById('filter-month')?.value;
    const ano = document.getElementById('filter-year')?.value;
    const sep = url.includes('?') ? '&' : '?';
    window.location.href = `${url}${sep}mes=${mes}&ano=${ano}`;
}

// ---------------------------------------------------------------------------
// Alternador de Visualização
// ---------------------------------------------------------------------------
function switchViewMode(mode) {
    viewMode = mode;
    const btnCards = document.getElementById('btn-mode-cards');
    const btnTable = document.getElementById('btn-mode-table');
    const cCards = document.getElementById('container-cards');
    const cTable = document.getElementById('container-table');
    const treeControls = document.getElementById('table-tree-controls');

    if (mode === 'cards') {
        btnCards?.classList.add('active');
        btnTable?.classList.remove('active');
        if (cCards) cCards.style.display = 'grid';
        if (cTable) cTable.style.display = 'none';
        if (treeControls) treeControls.style.display = 'none';
    } else {
        btnTable?.classList.add('active');
        btnCards?.classList.remove('active');
        if (cCards) cCards.style.display = 'none';
        if (cTable) cTable.style.display = 'flex';
        if (treeControls) treeControls.style.display = 'flex';
    }
    renderTable();
}

function expandAllPaises() {
    collapsedPaises.clear();
    renderTable();
}

function collapseAllPaises() {
    if (currentData && currentData.paises) {
        currentData.paises.forEach(p => collapsedPaises.add(p.item));
    }
    renderTable();
}

function togglePaisExpansion(paisName, event) {
    if (event) event.stopPropagation();
    if (collapsedPaises.has(paisName)) {
        collapsedPaises.delete(paisName);
    } else {
        collapsedPaises.add(paisName);
    }
    renderTable();
}

// ---------------------------------------------------------------------------
// Filtros Multiselect de Marcas e Países
// ---------------------------------------------------------------------------
function toggleMarcaDropdown(e) {
    e.stopPropagation();
    document.getElementById('pais-select-menu')?.classList.remove('show');
    document.getElementById('marca-select-menu')?.classList.toggle('show');
}

function togglePaisDropdown(e) {
    e.stopPropagation();
    document.getElementById('marca-select-menu')?.classList.remove('show');
    document.getElementById('pais-select-menu')?.classList.toggle('show');
}

function initMarcaMultiselect() {
    if (!currentData || !currentData.marcas) return;
    if (allAvailableMarcas.length === 0) {
        allAvailableMarcas = [...currentData.marcas];
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
        item.style.padding = '5px 8px';
        item.style.cursor = 'pointer';
        item.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="onMarcaCheckboxChange('${marca.replace(/'/g, "\\'")}', this.checked, event)">
                <span class="ms-label-text">${escapeHtml(marca)}</span>
            </div>
        `;
        grid.appendChild(item);
    });
    updateMarcaSelectLabel();
}

function onMarcaCheckboxChange(marca, isChecked, event) {
    if (event) event.stopPropagation();
    if (isChecked) {
        if (!selectedMarcas.includes(marca)) selectedMarcas.push(marca);
    } else {
        selectedMarcas = selectedMarcas.filter(m => m !== marca);
    }
    syncMarcaCheckboxUI();
    updateMarcaSelectLabel();
    fetchData();
}

function selectAllMarcas(all, event) {
    if (event) event.stopPropagation();
    selectedMarcas = all ? [...allAvailableMarcas] : [];
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
    if (badgeEl) badgeEl.innerText = `${count} de ${total} sel.`;
    if (count === total || count === 0) {
        labelEl.innerText = 'Marcas: Todas';
    } else if (count === 1) {
        labelEl.innerText = `Marca: ${selectedMarcas[0]}`;
    } else {
        labelEl.innerText = `Marcas (${count})`;
    }
}

function initPaisMultiselect() {
    if (!currentData || !currentData.paises_lista) return;
    if (allAvailablePaises.length === 0) {
        allAvailablePaises = [...currentData.paises_lista];
        selectedPaises = [...allAvailablePaises];
    }
    const grid = document.getElementById('pais-checkbox-grid');
    if (!grid) return;
    grid.innerHTML = '';

    allAvailablePaises.forEach((pais, idx) => {
        const isChecked = selectedPaises.includes(pais);
        const item = document.createElement('label');
        item.className = `ms-item ${isChecked ? 'checked' : ''}`;
        item.id = `pais-item-${idx}`;
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.padding = '5px 8px';
        item.style.cursor = 'pointer';
        item.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="onPaisCheckboxChange('${pais.replace(/'/g, "\\'")}', this.checked, event)">
                <span style="font-size:1.1rem;">${getCountryFlag(pais)}</span>
                <span class="ms-label-text">${escapeHtml(pais)}</span>
            </div>
        `;
        grid.appendChild(item);
    });
    updatePaisSelectLabel();
}

function onPaisCheckboxChange(pais, isChecked, event) {
    if (event) event.stopPropagation();
    if (isChecked) {
        if (!selectedPaises.includes(pais)) selectedPaises.push(pais);
    } else {
        selectedPaises = selectedPaises.filter(p => p !== pais);
    }
    syncPaisCheckboxUI();
    updatePaisSelectLabel();
    renderTable();
}

function selectAllPaises(all, event) {
    if (event) event.stopPropagation();
    selectedPaises = all ? [...allAvailablePaises] : [];
    syncPaisCheckboxUI();
    updatePaisSelectLabel();
    renderTable();
}

function syncPaisCheckboxUI() {
    allAvailablePaises.forEach((pais, idx) => {
        const isChecked = selectedPaises.includes(pais);
        const item = document.getElementById(`pais-item-${idx}`);
        if (item) {
            item.classList.toggle('checked', isChecked);
            const chk = item.querySelector('input');
            if (chk) chk.checked = isChecked;
        }
    });
}

function updatePaisSelectLabel() {
    const labelEl = document.getElementById('pais-select-label');
    const badgeEl = document.getElementById('pais-count-badge');
    if (!labelEl) return;
    const total = allAvailablePaises.length;
    const count = selectedPaises.length;
    if (badgeEl) badgeEl.innerText = `${count} de ${total} sel.`;
    if (count === total || count === 0) {
        labelEl.innerText = 'Países: Todos';
    } else if (count === 1) {
        labelEl.innerText = `País: ${selectedPaises[0]}`;
    } else {
        labelEl.innerText = `Países (${count})`;
    }
}

function handleSearchInput() {
    renderTable();
}

// ---------------------------------------------------------------------------
// Busca de Dados da API
// ---------------------------------------------------------------------------
function manualRefresh() {
    fetchData(true);
}

function fetchData(force = false) {
    const mes = document.getElementById('filter-month')?.value || 9;
    const ano = document.getElementById('filter-year')?.value || 2026;

    let url = `/api/paises_dados?mes=${mes}&ano=${ano}`;
    if (force) url += '&force=1';

    if (selectedMarcas.length > 0 && selectedMarcas.length < allAvailableMarcas.length) {
        url += `&marca=${encodeURIComponent(selectedMarcas.join(','))}`;
    }

    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) {
        refreshBtn.innerText = '⏳ Carregando...';
        refreshBtn.disabled = true;
    }

    fetch(url)
        .then(res => res.json())
        .then(res => {
            if (refreshBtn) {
                refreshBtn.innerText = '🔄 Atualizar';
                refreshBtn.disabled = false;
            }
            if (res.success && res.data) {
                currentData = res.data;
                initMarcaMultiselect();
                initPaisMultiselect();
                renderTable();

                const lastUpEl = document.getElementById('last-update');
                if (lastUpEl) lastUpEl.innerText = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
            } else {
                console.error("Erro na API de países:", res.error);
            }
        })
        .catch(err => {
            if (refreshBtn) {
                refreshBtn.innerText = '🔄 Atualizar';
                refreshBtn.disabled = false;
            }
            console.error("Falha na requisição de países:", err);
        });
}

// ---------------------------------------------------------------------------
// Ordenação e Tabela
// ---------------------------------------------------------------------------
function sortTable(column) {
    if (currentSort.column === column) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.column = column;
        currentSort.asc = (column === 'item' || column === 'rank');
    }
    renderTable();
}

function renderTableHeader() {
    const theadRow = document.getElementById('table-header-row');
    if (!theadRow || !currentData) return;
    const ano = currentData.ano;

    theadRow.innerHTML = `
        <th class="col-rank sortable text-center" onclick="sortTable('rank')"># ↕</th>
        <th class="col-item sortable text-left" onclick="sortTable('item')" style="min-width: 220px;">País / Produto ↕</th>
        <th class="col-share-ant sortable text-right" onclick="sortTable('share_ant')" title="Participação no COMEX no mesmo período do ano anterior">Share ${ano - 1} ↕</th>
        <th class="col-share-periodo sortable text-right" onclick="sortTable('share')" title="Participação no COMEX no acumulado do ano atual">Share ${ano} ↕</th>
        <th class="col-share-pp sortable text-right" onclick="sortTable('evolucao_pp')" title="Variação em pontos percentuais (Share ${ano} - Share ${ano - 1})">Evolução p.p ↕</th>
        <th class="col-share-var sortable text-right" onclick="sortTable('evolucao_share')" title="Evolução percentual do faturamento">Evolução ↕</th>
    `;
}

function renderTable() {
    if (!currentData || !currentData.paises) return;

    renderTableHeader();

    let items = [...currentData.paises].filter(p => (p.faturamento > 0 || p.faturamento_ant > 0));

    // Filtro por seleção de países
    if (selectedPaises.length > 0) {
        items = items.filter(p => selectedPaises.includes(p.item));
    } else if (allAvailablePaises.length > 0 && selectedPaises.length === 0) {
        items = [];
    }

    // Filtro de busca textual
    const searchTerm = (document.getElementById('table-search')?.value || '').toLowerCase().trim();
    let filtered = [];
    if (!searchTerm) {
        filtered = items;
    } else {
        items.forEach(pais => {
            const paisMatches = pais.item.toLowerCase().includes(searchTerm);
            const matchingProds = (pais.produtos || []).filter(pr => pr.item.toLowerCase().includes(searchTerm));
            if (paisMatches || matchingProds.length > 0) {
                filtered.push({
                    ...pais,
                    produtos: paisMatches ? pais.produtos : matchingProds
                });
            }
        });
    }

    // Ordenação
    filtered.sort((a, b) => {
        let valA, valB;
        if (currentSort.column === 'evolucao_pp') {
            valA = (a.share ?? 0) - (a.share_ant ?? 0);
            valB = (b.share ?? 0) - (b.share_ant ?? 0);
        } else if (currentSort.column === 'evolucao_share') {
            valA = a.evolucao_pct ?? 0;
            valB = b.evolucao_pct ?? 0;
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

    renderCards(filtered);

    const tbody = document.getElementById('table-body');
    const tfoot = document.getElementById('table-footer');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:#8c93a0;">Nenhum país encontrado com os filtros atuais.</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const htmlRows = [];
    let totShareAnt = 0;
    let totShareAtual = 0;

    filtered.forEach((pais, idx) => {
        const isCollapsed = collapsedPaises.has(pais.item);
        const prods = pais.produtos || [];
        const expandIcon = isCollapsed ? '▶' : '▼';

        const shareAnt = pais.share_ant ?? 0;
        const shareAtual = pais.share ?? 0;
        const paisPp = pais.var_pp ?? (shareAtual - shareAnt);
        const paisEvol = pais.evolucao_pct ?? 0;

        totShareAnt += shareAnt;
        totShareAtual += shareAtual;

        const safePaisItem = pais.item.replace(/'/g, "\\'");
        const flag = getCountryFlag(pais.item);

        // Linha Principal do País
        htmlRows.push(`
            <tr class="cat-header-row ${isCollapsed ? 'collapsed' : ''}" onclick="togglePaisExpansion('${safePaisItem}', event)" title="Clique para expandir/recolher produtos deste país">
                <td class="col-rank text-center">${renderRankBadge(idx + 1)}</td>
                <td class="col-item text-left" style="min-width: 220px;">
                    <div class="cat-item-content">
                        <span class="cat-toggle-icon">${expandIcon}</span>
                        <span style="font-size:1.2rem; margin-right:4px;">${flag}</span>
                        <span class="cat-title-text">${escapeHtml(pais.item)}</span>
                        <span class="cat-count-pill">${prods.length} ${prods.length === 1 ? 'prod' : 'prods'}</span>
                    </div>
                </td>
                <td class="col-share-ant text-right cat-share-ant"><span class="share-ant-val">${shareAnt.toFixed(1).replace('.', ',')}%</span></td>
                <td class="col-share-periodo text-right cat-share-periodo"><span class="share-periodo-val" style="font-weight:700; color:#ffd700;">${shareAtual.toFixed(1).replace('.', ',')}%</span></td>
                <td class="col-share-pp text-right">${formatPp(paisPp)}</td>
                <td class="col-share-var text-right">${formatEvol(paisEvol)}</td>
            </tr>
        `);

        // Sublinhas dos Produtos por País
        if (!isCollapsed && prods.length > 0) {
            prods.forEach((prod, pIdx) => {
                const prodShareAnt = prod.share_ant ?? 0;
                const prodShareAtual = prod.share ?? 0;
                const prodPp = prod.var_pp ?? (prodShareAtual - prodShareAnt);
                const prodEvol = prod.evolucao_pct ?? 0;

                htmlRows.push(`
                    <tr class="prod-sub-row">
                        <td class="col-rank text-center prod-rank-cell">
                            <span class="prod-sub-num">${pIdx + 1}º</span>
                        </td>
                        <td class="col-item text-left prod-item-cell" title="${escapeHtml(prod.item)}" style="min-width: 220px; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
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

    // Rodapé Totalizador
    if (tfoot) {
        const totalPp = totShareAtual - totShareAnt;
        let totalEvol = 0;
        const totFatAtual = currentData.total_faturamento ?? 0;
        const totFatAnt = currentData.total_faturamento_ant ?? 0;
        if (totFatAnt > 0) totalEvol = ((totFatAtual - totFatAnt) / totFatAnt) * 100;

        tfoot.innerHTML = `
            <tr class="table-total-row">
                <td class="text-center" style="font-weight:800; color:#ffd700;">Σ</td>
                <td class="text-left" style="font-weight:800; color:#ffffff;">TOTAL COMEX (${filtered.length} PAÍSES)</td>
                <td class="text-right" style="font-weight:700; color:#8c93a0;">${totShareAnt.toFixed(1).replace('.', ',')}%</td>
                <td class="text-right" style="font-weight:800; color:#ffd700;">${totShareAtual.toFixed(1).replace('.', ',')}%</td>
                <td class="text-right">${formatPp(totalPp)}</td>
                <td class="text-right">${formatEvol(totalEvol)}</td>
            </tr>
        `;
    }
}

// ---------------------------------------------------------------------------
// Renderização do Modo Cards (Colunas Lado a Lado)
// ---------------------------------------------------------------------------
function renderCards(paises) {
    const container = document.getElementById('container-cards');
    if (!container) return;

    if (!paises || paises.length === 0) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #8c93a0;">Nenhum país encontrado com os filtros selecionados.</div>`;
        return;
    }

    const ano = currentData.ano;
    const cardsHtml = paises.map((p, idx) => {
        const flag = getCountryFlag(p.item);
        const shareAnt = p.share_ant ?? 0;
        const shareAtual = p.share ?? 0;
        const varPp = p.var_pp ?? (shareAtual - shareAnt);
        const evolPct = p.evolucao_pct ?? 0;
        const topProds = (p.produtos || []).slice(0, 4);

        const prodsHtml = topProds.map((pr, pIdx) => {
            return `
                <div class="card-prod-row">
                    <span class="card-prod-rank">${pIdx + 1}º</span>
                    <span class="card-prod-name" title="${escapeHtml(pr.item)}">${escapeHtml(pr.item)}</span>
                    <span class="card-prod-share">${(pr.share ?? 0).toFixed(1).replace('.', ',')}%</span>
                </div>
            `;
        }).join('');

        return `
            <div class="category-column-card">
                <div class="col-card-header">
                    <div class="col-card-title-group">
                        <span class="col-card-icon" style="font-size:1.4rem;">${flag}</span>
                        <div class="col-card-title-wrap">
                            <h3 class="col-card-title">${escapeHtml(p.item)}</h3>
                            <span class="col-card-subtitle">${formatCompactMoney(p.faturamento)}</span>
                        </div>
                    </div>
                    <div class="col-card-rank-badge">
                        ${renderRankBadge(idx + 1)}
                    </div>
                </div>

                <div class="col-card-metrics-grid">
                    <div class="col-metric-item">
                        <span class="col-metric-label">Share ${ano - 1}</span>
                        <span class="col-metric-value muted">${shareAnt.toFixed(1).replace('.', ',')}%</span>
                    </div>
                    <div class="col-metric-item">
                        <span class="col-metric-label">Share ${ano}</span>
                        <span class="col-metric-value hero-gold">${shareAtual.toFixed(1).replace('.', ',')}%</span>
                    </div>
                    <div class="col-metric-item">
                        <span class="col-metric-label">Evolução p.p</span>
                        <span class="col-metric-value">${formatPp(varPp)}</span>
                    </div>
                    <div class="col-metric-item">
                        <span class="col-metric-label">Evolução %</span>
                        <span class="col-metric-value">${formatEvol(evolPct)}</span>
                    </div>
                </div>

                <div class="col-card-top-products">
                    <div class="top-prods-title">TOP PRODUTOS NO PAÍS</div>
                    <div class="top-prods-list">
                        ${prodsHtml || '<div style="color:#5c6370; font-size:0.75rem; padding:4px 0;">Nenhum produto individual registrado</div>'}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = cardsHtml;
}
