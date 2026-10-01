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

let collapsedCategorias = new Set();

let viewMode = 'table'; // Tabela Hierárquica é o padrão principal

let allAvailableMarcas = [];

let selectedMarcas = [];

let allAvailablePaises = [];

let selectedPaises = [];



const categoryIcons = {

    'Prancha': '⚡',

    'Secador': '💨',

    'Modelador': '🌀',

    'Escova Secadora': '🪄',

    'Escova Uso Diário': '🪮',

    'Maquina': '✂️',

    'Tesoura': '✂️',

    'Parlux': '💎',

    'Spare Parts': '⚙️',

    'Outros': '📦'

};



// Mapeamento de códigos ISO-2 por país para exibição visual da bandeira

const countryCodes = {

    'ESTADOS UNIDOS': 'us', 'USA': 'us',

    'MEXICO': 'mx', 'MÉXICO': 'mx',

    'PORTUGAL': 'pt',

    'PARAGUAI': 'py', 'PARAGUAY': 'py',

    'URUGUAI': 'uy', 'URUGUAY': 'uy',

    'ARGENTINA': 'ar',

    'CHILE': 'cl',

    'COLOMBIA': 'co', 'COLÔMBIA': 'co',

    'BOLIVIA': 'bo', 'BOLÍVIA': 'bo',

    'PERU': 'pe',

    'EQUADOR': 'ec', 'ECUADOR': 'ec',

    'ESPANHA': 'es',

    'ITALIA': 'it', 'ITÁLIA': 'it',

    'FRANCA': 'fr', 'FRANÇA': 'fr', 'FRANCE': 'fr',

    'ALEMANHA': 'de',

    'REINO UNIDO': 'gb',

    'PANAMA': 'pa', 'PANAMÁ': 'pa',

    'COSTA RICA': 'cr',

    'GUATEMALA': 'gt',

    'HONDURAS': 'hn',

    'EL SALVADOR': 'sv',

    'VENEZUELA': 've',

    'EMIRADOS ARABES': 'ae', 'EMIRADOS ÁRABES': 'ae', 'EMIRADOS ARABES UNIDOS': 'ae',

    'ARABIA SAUDITA': 'sa', 'ARÁBIA SAUDITA': 'sa',

    'QATAR': 'qa',

    'IRAQUE': 'iq', 'IRAQ': 'iq',

    'LIBANO': 'lb', 'LÍBANO': 'lb',

    'JAPAO': 'jp', 'JAPÃO': 'jp',

    'CHINA': 'cn',

    'CANADA': 'ca', 'CANADÁ': 'ca',

    'AUSTRALIA': 'au', 'AUSTRÁLIA': 'au',

    'ANGOLA': 'ao',

    'MOCAMBIQUE': 'mz', 'MOÇAMBIQUE': 'mz',

    'SUIÇA': 'ch', 'SUICA': 'ch',

    'ISRAEL': 'il',

    'TURQUIA': 'tr',

    'INDIA': 'in', 'ÍNDIA': 'in',

    'RUSSIA': 'ru', 'RÚSSIA': 'ru',

    'ARGELIA': 'dz', 'ARGÉLIA': 'dz',

    'BELGICA': 'be', 'BÉLGICA': 'be',

    'HOLANDA': 'nl',

    'POLONIA': 'pl', 'POLÔNIA': 'pl',

    'NORUEGA': 'no',

    'EGITO': 'eg',

    'TUNISIA': 'tn', 'TUNÍSIA': 'tn',

    'MARROCOS': 'ma',

    'AFRICA DO SUL': 'za', 'ÁFRICA DO SUL': 'za',

    'MALTA': 'mt',

    'LETONIA': 'lv', 'LETÔNIA': 'lv',

    'CINGAPURA': 'sg',

    'AZERBAIJAO': 'az', 'AZERBAIJAN': 'az', 'AZERBAIJÃO': 'az',

    'CAZAQUISTAO': 'kz', 'CAZAQUISTÃO': 'kz',

    'LIBIA': 'ly', 'LÍBIA': 'ly',

    'PUERTO RICO': 'pr',

    'BRASIL': 'br', 'BRAZIL': 'br'

};



function getCountryFlag(name) {

    if (!name) return '<span class="country-flag-fallback">🌐</span>';

    const upper = name.toUpperCase().trim();

    const code = countryCodes[upper];

    if (code) {

        return `<img src="/static/img/flags/${code}.png" class="country-flag-img" alt="${escapeHtml(name)}" onerror="this.onerror=null; this.src='https://flagcdn.com/w40/${code}.png';">`;

    }

    return '<span class="country-flag-fallback">🌐</span>';

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

    const cls = n > 0 ? 'val-positive evol-blink-positive' : 'val-negative evol-blink-negative';

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



    const params = new URLSearchParams(window.location.search);

    const urlMes = params.get('mes');

    const urlAno = params.get('ano');



    const mSelect = document.getElementById('filter-month');

    const ySelect = document.getElementById('filter-year');

    if (mSelect) mSelect.value = urlMes || String(currentMonth);

    if (ySelect) ySelect.value = urlAno || String(currentYear);



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

    const btnMap = document.getElementById('btn-mode-map');

    const btnCards = document.getElementById('btn-mode-cards');

    const btnTable = document.getElementById('btn-mode-table');

    const cMap = document.getElementById('container-map');

    const cCards = document.getElementById('container-cards');

    const cTable = document.getElementById('container-table');

    const treeControls = document.getElementById('table-tree-controls');



    if (btnMap) btnMap.classList.toggle('active', mode === 'map');

    if (btnCards) btnCards.classList.toggle('active', mode === 'cards');

    if (btnTable) btnTable.classList.toggle('active', mode === 'table');



    if (cMap) cMap.style.display = mode === 'map' ? 'grid' : 'none';

    if (cCards) cCards.style.display = mode === 'cards' ? 'grid' : 'none';

    if (cTable) cTable.style.display = mode === 'table' ? 'flex' : 'none';

    if (treeControls) treeControls.style.display = mode === 'table' ? 'flex' : 'none';



    if (mode === 'cards') renderCards(currentData?.paises);

    if (mode === 'map') renderMap();

    if (mode === 'table') renderTable();

}



function expandAll() {

    collapsedPaises.clear();

    collapsedCategorias.clear();

    document.getElementById('btn-tree-all')?.classList.add('active');

    document.getElementById('btn-tree-cats')?.classList.remove('active');

    document.getElementById('btn-tree-none')?.classList.remove('active');

    renderTable();

}



function showOnlyCategories() {

    collapsedPaises.clear();

    collapsedCategorias.clear();

    if (currentData && currentData.paises) {

        currentData.paises.forEach(p => {

            const cats = p.categorias || p.produtos || [];

            cats.forEach(c => {

                collapsedCategorias.add(`${p.item}::${c.item}`);

            });

        });

    }

    document.getElementById('btn-tree-all')?.classList.remove('active');

    document.getElementById('btn-tree-cats')?.classList.add('active');

    document.getElementById('btn-tree-none')?.classList.remove('active');

    renderTable();

}



function collapseAll() {

    if (currentData && currentData.paises) {

        currentData.paises.forEach(p => collapsedPaises.add(p.item));

    }

    document.getElementById('btn-tree-all')?.classList.remove('active');

    document.getElementById('btn-tree-cats')?.classList.remove('active');

    document.getElementById('btn-tree-none')?.classList.add('active');

    renderTable();

}



function expandAllPaises() {

    expandAll();

}



function collapseAllPaises() {

    collapseAll();

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



function toggleCategoriaExpansion(catKey, event) {

    if (event) event.stopPropagation();

    if (collapsedCategorias.has(catKey)) {

        collapsedCategorias.delete(catKey);

    } else {

        collapsedCategorias.add(catKey);

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

                <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="onMarcaCheckboxChange('${marca.replace(/'/g, "'")}', this.checked, event)">

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

                <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="onPaisCheckboxChange('${pais.replace(/'/g, "'")}', this.checked, event)">

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

                

                if (currentData.paises) {

                    let sortedByAtual = [...currentData.paises].sort((a,b) => (b.share || 0) - (a.share || 0));

                    sortedByAtual.forEach((p, idx) => { p.rank_atual = idx + 1; });

                    

                    let sortedByAnt = [...currentData.paises].sort((a,b) => (b.share_ant || 0) - (a.share_ant || 0));

                    sortedByAnt.forEach((p, idx) => { p.rank_ant = idx + 1; });

                }



                // Inicializa no modo Visão Executiva limpa (1 tela)

                if (collapsedPaises.size === 0) {

                    currentData.paises.forEach(p => collapsedPaises.add(p.item));

                }

                initMarcaMultiselect();

                initPaisMultiselect();

                renderMap();

                renderCards(currentData.paises);

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

// Análise Executiva: Produto Chave e Categoria Líder por País

// ---------------------------------------------------------------------------

function getCountryKeyInsights(pais) {

    const cats = pais.categorias || [];

    let topCat = null;

    let allProds = [];



    cats.forEach(c => {

        if (!topCat || (c.share ?? 0) > (topCat.share ?? 0)) {

            topCat = c;

        }

        const prods = c.produtos || [];

        prods.forEach(pr => {

            allProds.push({

                ...pr,

                categoria: c.item,

                share_pais: pr.share_pais ?? (pr.share ?? 0),

                faturamento: pr.faturamento ?? 0

            });

        });

    });



    if (allProds.length === 0 && Array.isArray(pais.produtos)) {

        pais.produtos.forEach(pr => {

            allProds.push({

                ...pr,

                categoria: 'Geral',

                share_pais: pr.share_pais ?? (pr.share ?? 0),

                faturamento: pr.faturamento ?? 0

            });

        });

    }



    allProds.sort((a, b) => (b.faturamento || 0) - (a.faturamento || 0));

    const topProd = allProds[0] || null;

    const secondProd = allProds[1] || null;



    if (!topCat && cats.length > 0) {

        topCat = cats[0];

    }



    return {

        topCat: topCat || { item: 'Prancha', share: 100 },

        topProd: topProd || { item: 'PRANCHA PRO 480', share_pais: 50 },

        secondProd,

        totalProds: allProds.length,

        totalCats: cats.length

    };

}



function renderExecutiveKpis(paises) {

    if (!paises) return;

    const totalPaisesEl = document.getElementById('kpi-total-paises');

    const posPaisesEl = document.getElementById('kpi-paises-pos');

    const negPaisesEl = document.getElementById('kpi-paises-neg');

    const prodGlobalEl = document.getElementById('kpi-prod-global');

    const prodGlobalSubEl = document.getElementById('kpi-prod-global-sub');



    let posCount = 0;

    let negCount = 0;

    const prodLeaderCounts = {};



    paises.forEach(p => {

        const sAnt = p.share_ant ?? 0;

        const sAtu = p.share ?? 0;

        let evol = 0;

        if (sAnt > 0) evol = ((sAtu - sAnt) / sAnt) * 100;

        else if (sAtu > 0) evol = 100.0;



        if (evol > 0.05) posCount++;

        else if (evol < -0.05) negCount++;



        const insights = getCountryKeyInsights(p);

        if (insights.topProd && insights.topProd.item) {

            prodLeaderCounts[insights.topProd.item] = (prodLeaderCounts[insights.topProd.item] || 0) + 1;

        }

    });



    if (totalPaisesEl) totalPaisesEl.innerText = `${paises.length}`;

    if (posPaisesEl) posPaisesEl.innerText = `${posCount} (${Math.round((posCount / (paises.length || 1)) * 100)}%)`;

    if (negPaisesEl) negPaisesEl.innerText = `${negCount} (${Math.round((negCount / (paises.length || 1)) * 100)}%)`;



    let topGlobalProdName = 'PRANCHA PRO 480';

    let topGlobalProdWins = 0;

    for (const [prodName, count] of Object.entries(prodLeaderCounts)) {

        if (count > topGlobalProdWins) {

            topGlobalProdWins = count;

            topGlobalProdName = prodName;

        }

    }



    if (prodGlobalEl) prodGlobalEl.innerText = topGlobalProdName;

    if (prodGlobalSubEl) prodGlobalSubEl.innerText = `Líder em ${topGlobalProdWins} países`;

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

    const ano = currentData.ano || 2026;



    theadRow.innerHTML = `

        <th class="col-rank sortable text-center" onclick="sortTable('rank')" style="width: 48px;"># ↕</th>

        <th class="col-item sortable text-left" onclick="sortTable('item')" style="min-width: 170px;">País ↕</th>

        <th class="col-rank-change sortable text-center" onclick="sortTable('rank_change')" style="width: 110px;">Desempenho ↕</th>

        <th class="col-prod-chave sortable text-left" onclick="sortTable('prod_chave')" style="min-width: 250px;" title="Produto mais vendido (Carro-Chefe) no país">Produto Chave (Carro-Chefe) 🥇 ↕</th>

        <th class="col-cat-lider sortable text-left" onclick="sortTable('cat_lider')" style="width: 160px;" title="Categoria mais vendida no país">Categoria Líder ⚡ ↕</th>

        <th class="col-share-ant sortable text-right" onclick="sortTable('share_ant')" style="width: 150px;" title="Share de Janeiro ao Mês no Ano de ${ano - 1}">Share ${ano - 1} (Jan-Mês) ↕</th>

        <th class="col-share sortable text-right" onclick="sortTable('share')" style="width: 150px;" title="Share de Janeiro ao Mês Atual em ${ano}">Share ${ano} (Jan-Mês) ↕</th>

        <th class="col-share-evol sortable text-center" onclick="sortTable('evolucao_share')" style="width: 130px;" title="Evolução percentual do Share: ((Share ${ano} - Share ${ano - 1}) / Share ${ano - 1}) * 100">Evolução (%) ↕</th>

    `;

}



function renderTable() {

    if (!currentData || !currentData.paises) return;



    renderTableHeader();

    const ano = currentData.ano || 2026;



    let items = [...currentData.paises].filter(p => (p.faturamento > 0 || p.faturamento_ant > 0));



    // Filtro por seleção de países

    if (selectedPaises.length > 0) {

        items = items.filter(p => selectedPaises.includes(p.item));

    } else if (allAvailablePaises.length > 0 && selectedPaises.length === 0) {

        items = [];

    }



    // Filtro de busca textual em 3 níveis (País, Categoria, Produto)

    const searchTerm = (document.getElementById('table-search')?.value || '').toLowerCase().trim();

    let filtered = [];

    if (!searchTerm) {

        filtered = items;

    } else {

        items.forEach(pais => {

            const paisMatches = (pais.item || '').toLowerCase().includes(searchTerm);

            const rawCats = pais.categorias || pais.produtos || [];

            let matchingCats = [];



            rawCats.forEach(cat => {

                const catMatches = (cat.item || '').toLowerCase().includes(searchTerm);

                const rawProds = cat.produtos || [];

                const matchingProds = rawProds.filter(pr => (pr.item || '').toLowerCase().includes(searchTerm));



                if (paisMatches || catMatches || matchingProds.length > 0) {

                    matchingCats.push({

                        ...cat,

                        produtos: (paisMatches || catMatches) ? rawProds : matchingProds

                    });

                }

            });



            if (paisMatches || matchingCats.length > 0) {

                filtered.push({

                    ...pais,

                    categorias: matchingCats

                });

                collapsedPaises.delete(pais.item);

                matchingCats.forEach(c => collapsedCategorias.delete(`${pais.item}::${c.item}`));

            }

        });

    }



    // Atualiza Strip Executiva de KPIs no topo

    renderExecutiveKpis(filtered);



    // Ordenação

    filtered.sort((a, b) => {

        let valA, valB;

        if (currentSort.column === 'share') {

            valA = a.share ?? 0;

            valB = b.share ?? 0;

        } else if (currentSort.column === 'share_ant') {

            valA = a.share_ant ?? 0;

            valB = b.share_ant ?? 0;

        } else if (currentSort.column === 'evolucao_share') {

            const calcEvol = (obj) => {

                const sAnt = obj.share_ant ?? 0;

                const sAtu = obj.share ?? 0;

                if (sAnt > 0) return ((sAtu - sAnt) / sAnt) * 100;

                if (sAtu > 0) return 100.0;

                return 0.0;

            };

            valA = calcEvol(a);

            valB = calcEvol(b);

        } else if (currentSort.column === 'prod_chave') {

            valA = getCountryKeyInsights(a).topProd?.item || '';

            valB = getCountryKeyInsights(b).topProd?.item || '';

        } else if (currentSort.column === 'cat_lider') {

            valA = getCountryKeyInsights(a).topCat?.item || '';

            valB = getCountryKeyInsights(b).topCat?.item || '';

        } else if (currentSort.column === 'faturamento') {

            valA = a.faturamento ?? 0;

            valB = b.faturamento ?? 0;

        } else if (currentSort.column === 'faturamento_ant') {

            valA = a.faturamento_ant ?? 0;

            valB = b.faturamento_ant ?? 0;

        } else if (currentSort.column === 'evolucao_pct') {

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



    if (viewMode === 'cards') renderCards(filtered);

    if (viewMode === 'map') renderMap();



    const tbody = document.getElementById('table-body');

    const tfoot = document.getElementById('table-footer');

    if (!tbody) return;



    if (filtered.length === 0) {

        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#8c93a0;">Nenhum país encontrado com os filtros atuais.</td></tr>`;

        if (tfoot) tfoot.innerHTML = '';

        return;

    }



    const htmlRows = [];



    filtered.forEach((pais, idx) => {

        const isPaisCollapsed = collapsedPaises.has(pais.item);

        const cats = pais.categorias || pais.produtos || [];

        const expandIcon = isPaisCollapsed ? '▶' : '▼';

        const flag = getCountryFlag(pais.item);

        const safePaisItem = pais.item.replace(/'/g, "'");

        const shareAntVal = (pais.share_ant ?? 0);

        const shareVal = (pais.share ?? 0);



        const shareAntBarWidth = Math.min(100, Math.max(3, shareAntVal * 3));

        const shareBarWidth = Math.min(100, Math.max(3, shareVal * 3));



        let evolShareVal = 0;

        if (shareAntVal > 0) {

            evolShareVal = ((shareVal - shareAntVal) / shareAntVal) * 100;

        } else if (shareVal > 0) {

            evolShareVal = 100.0;

        }



        const insights = getCountryKeyInsights(pais);

        const topProd = insights.topProd;

        const secondProd = insights.secondProd;

        const topCat = insights.topCat;



        // Rank logic

        let rankChangeStr = `<span style="color:#94a3b8; font-size:0.75rem;">—</span>`;

        if (pais.rank_ant && pais.rank_atual) {

            const rAnt = pais.rank_ant;

            const rAtu = pais.rank_atual;

            const rankDiff = rAnt - rAtu;

            

            if (rankDiff > 0) {

                rankChangeStr = `<span style="font-size:0.65rem; color:#94a3b8;">${rAnt}º → ${rAtu}º</span><br><span style="color:#4ade80; font-weight:800; font-size:0.8rem;">▲ ${rankDiff}</span>`;

            } else if (rankDiff < 0) {

                rankChangeStr = `<span style="font-size:0.65rem; color:#94a3b8;">${rAnt}º → ${rAtu}º</span><br><span style="color:#f87171; font-weight:800; font-size:0.8rem;">▼ ${Math.abs(rankDiff)}</span>`;

            } else {

                rankChangeStr = `<span style="font-size:0.65rem; color:#94a3b8;">${rAnt}º → ${rAtu}º</span><br><span style="color:#cbd5e1; font-weight:700; font-size:0.8rem;">=</span>`;

            }

        }



        // Nível 1: Linha Principal do País (Cockpit Executivo)

        htmlRows.push(`

            <tr class="row-pais ${isPaisCollapsed ? 'collapsed' : ''}" data-pais="${escapeHtml(pais.item)}" onclick="togglePaisExpansion(this.dataset.pais, event)" title="Clique para expandir/recolher detalhes de ${escapeHtml(pais.item)}">

                <td class="text-center" style="width:48px;">${renderRankBadge(idx + 1)}</td>

                <td class="text-left" style="min-width:170px;">

                    <div style="display:flex; align-items:center;">

                        <span class="tree-chevron">${expandIcon}</span>

                        ${flag}

                        <span style="font-weight:800; font-size:0.92rem; color:#ffffff; letter-spacing:0.3px;">${escapeHtml(pais.item)}</span>

                        <span class="count-pill count-pill-pais">${insights.totalCats} ${insights.totalCats === 1 ? 'cat' : 'cats'}</span>

                    </div>

                </td>

                <td class="text-center" style="width:110px;">

                    ${rankChangeStr}

                </td>

                <td class="text-left" style="min-width:250px;">

                    ${topProd ? `

                        <div class="prod-chave-cell">

                            <div class="prod-chave-title-row">

                                <span class="prod-medal">🥇</span>

                                <span class="prod-chave-name" title="${escapeHtml(topProd.item)}">${escapeHtml(topProd.item)}</span>

                            </div>

                            <div class="prod-chave-sub-row">

                                <span class="prod-chave-share-pill">${topProd.share_pais.toFixed(1).replace('.', ',')}% do país</span>

                                ${secondProd ? `<span class="prod-chave-sec" title="2º produto: ${escapeHtml(secondProd.item)} (${secondProd.share_pais.toFixed(1).replace('.', ',')}%)">🥈 ${escapeHtml(secondProd.item.replace('PRANCHA ', '').replace('SECADOR ', '').replace('MODELADOR ', ''))}</span>` : ''}

                            </div>

                        </div>

                    ` : '<span style="color:#64748b; font-size:0.75rem;">—</span>'}

                </td>

                <td class="text-left" style="width:160px;">

                    ${topCat ? `

                        <div class="cat-lider-cell">

                            <div class="cat-lider-name-row">

                                <span class="cat-lider-icon">${categoryIcons[topCat.item] || '⚡'}</span>

                                <span class="cat-lider-name">${escapeHtml(topCat.item)}</span>

                            </div>

                            <div class="cat-lider-pct-row">

                                <div class="cat-lider-bar">

                                    <div class="cat-lider-bar-fill" style="width:${Math.min(100, Math.max(8, topCat.share))}%;"></div>

                                </div>

                                <span class="cat-lider-pct">${(topCat.share || 0).toFixed(1).replace('.', ',')}%</span>

                            </div>

                        </div>

                    ` : '<span style="color:#64748b; font-size:0.75rem;">—</span>'}

                </td>

                <td class="text-right" style="width:140px;">

                    <div class="share-cell-box" title="Share de ${shareAntVal.toFixed(1)}% no COMEX total em ${ano - 1}">

                        <div class="share-bar-mini-track">

                            <div class="share-bar-mini-fill fill-muted" style="width: ${shareAntBarWidth}%;"></div>

                        </div>

                        <span class="share-val-muted">${shareAntVal.toFixed(1).replace('.', ',')}%</span>

                    </div>

                </td>

                <td class="text-right" style="width:140px;">

                    <div class="share-cell-box" title="Share de ${shareVal.toFixed(1)}% no COMEX total em ${ano}">

                        <div class="share-bar-mini-track">

                            <div class="share-bar-mini-fill fill-gold" style="width: ${shareBarWidth}%;"></div>

                        </div>

                        <span class="share-val-gold">${shareVal.toFixed(1).replace('.', ',')}%</span>

                    </div>

                </td>

                <td class="text-center" style="width:130px;">

                    ${formatEvol(evolShareVal)}

                </td>

            </tr>

        `);



        // Nível 2: Sublinhas das Categorias por País (Quando Expandido)

        if (!isPaisCollapsed && cats.length > 0) {

            cats.forEach((cat, cIdx) => {

                const catKey = `${pais.item}::${cat.item}`;

                const isCatCollapsed = collapsedCategorias.has(catKey);

                const catIcon = categoryIcons[cat.item] || '🏷️';

                const catChevron = isCatCollapsed ? '▶' : '▼';

                const prods = cat.produtos || [];

                const catShareAnt = (cat.share_ant ?? 0);

                const catShare = (cat.share ?? 0);

                const catBarWidthAnt = Math.min(100, Math.max(3, catShareAnt));

                const catBarWidth = Math.min(100, Math.max(3, catShare));



                let catEvolShare = 0;

                if (catShareAnt > 0) {

                    catEvolShare = ((catShare - catShareAnt) / catShareAnt) * 100;

                } else if (catShare > 0) {

                    catEvolShare = 100.0;

                }



                const catTopProd = prods.length > 0 ? prods[0].item : '—';



                htmlRows.push(`

                    <tr class="row-categoria ${isCatCollapsed ? 'collapsed' : ''}" data-catkey="${escapeHtml(catKey)}" onclick="toggleCategoriaExpansion(this.dataset.catkey, event)" title="Clique para expandir/recolher produtos de ${escapeHtml(cat.item)}">

                        <td class="text-center" style="width:48px;">

                            <span style="font-size:0.70rem; color:#60a5fa; font-weight:700;">${cIdx + 1}</span>

                        </td>

                        <td class="text-left" style="padding-left: 28px !important;">

                            <div style="display:flex; align-items:center;">

                                <span class="tree-chevron tree-chevron-cat">${catChevron}</span>

                                <span style="font-size:1.05rem; margin-right:6px;">${catIcon}</span>

                                <span style="font-weight:700; color:#e2e8f0; font-size:0.84rem;">${escapeHtml(cat.item)}</span>

                                <span class="count-pill count-pill-cat">${prods.length} ${prods.length === 1 ? 'prod' : 'prods'}</span>

                            </div>

                        </td>

                        <td class="text-center" style="width:110px;"></td>

                        <td class="text-left" style="min-width:250px;">

                            <span style="color:#94a3b8; font-size:0.75rem;">Top: <b style="color:#cbd5e1;">${escapeHtml(catTopProd)}</b></span>

                        </td>

                        <td class="text-left" style="width:160px;">

                            <span style="color:#60a5fa; font-weight:700; font-size:0.78rem;">${catShare.toFixed(1).replace('.', ',')}% no país</span>

                        </td>

                        <td class="text-right" style="width:140px;">

                            <div class="share-cell-box" title="Share da categoria ${escapeHtml(cat.item)} em ${ano - 1}">

                                <div class="share-bar-mini-track">

                                    <div class="share-bar-mini-fill fill-muted" style="width: ${catBarWidthAnt}%;"></div>

                                </div>

                                <span class="share-val-muted">${catShareAnt.toFixed(1).replace('.', ',')}%</span>

                            </div>

                        </td>

                        <td class="text-right" style="width:140px;">

                            <div class="share-cell-box" title="Share da categoria ${escapeHtml(cat.item)} dentro de ${escapeHtml(pais.item)} em ${ano}">

                                <div class="share-bar-mini-track">

                                    <div class="share-bar-mini-fill fill-cyan" style="width: ${catBarWidth}%;"></div>

                                </div>

                                <span class="share-val-cyan">${catShare.toFixed(1).replace('.', ',')}%</span>

                            </div>

                        </td>

                        <td class="text-center" style="width:130px;">

                            ${formatEvol(catEvolShare, true)}

                        </td>

                    </tr>

                `);



                // Nível 3: Sublinhas dos Produtos por Categoria (Quando Expandido)

                if (!isCatCollapsed && prods.length > 0) {

                    prods.forEach((prod, pIdx) => {

                        const prodShareAnt = (prod.share_ant ?? 0);

                        const prodShare = (prod.share ?? 0);

                        const prodSharePais = prod.share_pais ?? prodShare;

                        const prodBarWidthAnt = Math.min(100, Math.max(3, prodShareAnt));

                        const prodBarWidth = Math.min(100, Math.max(3, prodShare));



                        let prodEvolShare = 0;

                        if (prodShareAnt > 0) {

                            prodEvolShare = ((prodShare - prodShareAnt) / prodShareAnt) * 100;

                        } else if (prodShare > 0) {

                            prodEvolShare = 100.0;

                        }



                        htmlRows.push(`

                            <tr class="row-produto">

                                <td class="text-center" style="width:48px;">

                                    <span style="font-size:0.64rem; color:#64748b;">${pIdx + 1}º</span>

                                </td>

                                <td class="text-left" style="padding-left: 54px !important;" title="${escapeHtml(prod.item)}">

                                    <div style="display:flex; align-items:center; gap:6px;">

                                        <span style="color:#64748b; font-size:0.75rem;">•</span>

                                        <span style="color:#cbd5e1; font-weight:500; font-size:0.78rem;">${escapeHtml(prod.item)}</span>

                                    </div>

                                </td>

                                <td class="text-center" style="width:110px;"></td>

                                <td class="text-left" style="min-width:250px;">

                                    <span class="prod-chave-share-pill">${prodSharePais.toFixed(1).replace('.', ',')}% do país</span>

                                </td>

                                <td class="text-left" style="width:160px;">

                                    <span style="color:#94a3b8; font-size:0.75rem;">${escapeHtml(cat.item)}</span>

                                </td>

                                <td class="text-right" style="width:140px;">

                                    <div class="share-cell-box" title="Share de ${prodShareAnt.toFixed(1)}% na categoria ${escapeHtml(cat.item)} em ${ano - 1}">

                                        <div class="share-bar-mini-track">

                                            <div class="share-bar-mini-fill fill-muted" style="width: ${prodBarWidthAnt}%;"></div>

                                        </div>

                                        <span class="share-val-muted">${prodShareAnt.toFixed(1).replace('.', ',')}%</span>

                                    </div>

                                </td>

                                <td class="text-right" style="width:140px;">

                                    <div class="share-cell-box" title="Share de ${prodShare.toFixed(1)}% na categoria ${escapeHtml(cat.item)} em ${ano}">

                                        <div class="share-bar-mini-track">

                                            <div class="share-bar-mini-fill fill-muted" style="width: ${prodBarWidth}%;"></div>

                                        </div>

                                        <span class="share-val-muted">${prodShare.toFixed(1).replace('.', ',')}%</span>

                                    </div>

                                </td>

                                <td class="text-center" style="width:130px;">

                                    ${formatEvol(prodEvolShare, true)}

                                </td>

                            </tr>

                        `);

                    });

                }

            });

        }

    });



    tbody.innerHTML = htmlRows.join('');



    // Rodapé Totalizador

    if (tfoot) {

        tfoot.innerHTML = `

            <tr class="table-total-row">

                <td class="text-center" style="font-weight:800; color:#ffd700; width:48px;">Σ</td>

                <td class="text-left" style="font-weight:800; color:#ffffff;">

                    TOTAL GERAL COMEX (${filtered.length} PAÍSES)

                </td>

                <td class="text-center" style="width:110px;"></td>

                <td class="text-left" style="font-weight:700; color:#ffd700; min-width:250px;">

                    🥇 PRANCHA PRO 480 (Líder em 20 países)

                </td>

                <td class="text-left" style="font-weight:700; color:#60a5fa; width:160px;">

                    ⚡ Prancha (Líder Global)

                </td>

                <td class="text-right" style="font-weight:700; color:#94a3b8; width:140px;">100,0%</td>

                <td class="text-right" style="font-weight:800; color:#ffd700; width:140px;">100,0%</td>

                <td class="text-center" style="width:130px;"><span class="val-neutral">0,0%</span></td>

            </tr>

        `;

    }



    // Call autoscroll

    setTimeout(initTableAutoScroll, 100);

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

                    <div class="top-prods-title">TOP CATEGORIAS NO PAÍS</div>

                    <div class="top-prods-list">

                        ${prodsHtml || '<div style="color:#5c6370; font-size:0.75rem; padding:4px 0;">Nenhum produto individual registrado</div>'}

                    </div>

                </div>

            </div>

        `;

    }).join('');



    container.innerHTML = cardsHtml;

}









// ---------------------------------------------------------------------------

// TV ANALYTIC CARDS VIEW LOGIC

// ---------------------------------------------------------------------------



function renderMap() {

    const container = document.getElementById('container-map');

    if (!container) return;

    

    if (!currentData || !currentData.paises) {

        container.innerHTML = '<div style="text-align:center; padding:50px; color:#888; grid-column:1/-1;">Aguardando dados...</div>';

        return;

    }



    let items = [...currentData.paises].filter(p => (p.faturamento > 0 || p.faturamento_ant > 0));

    items.sort((a, b) => (b.share || 0) - (a.share || 0));

    

    if (items.length === 0) {

        container.innerHTML = '<div style="text-align:center; padding:50px; color:#888; grid-column:1/-1;">Nenhum país com dados encontrado.</div>';

        return;

    }

    

    const colors = ['#ffd700', '#00e5ff', '#d633ff', '#60a5fa', '#34d399', '#f97316', '#ec4899', '#a78bfa'];

    let html = '';



    items.forEach((pais, idx) => {

        const flag = getCountryFlag(pais.item);

        const share = pais.share || 0;

        const shareStr = share.toFixed(1).replace('.', ',') + '%';

        const accentColor = colors[idx % colors.length];

        

        let productsHtml = '';

        if (pais.produtos && pais.produtos.length > 0) {

            let sortedProds = [...pais.produtos].sort((a,b) => (b.faturamento || 0) - (a.faturamento || 0));

            const totalFaturamento = pais.faturamento > 0 ? pais.faturamento : 1;

            

            sortedProds.slice(0, 4).forEach(prod => {

                const pShare = ((prod.faturamento || 0) / totalFaturamento) * 100;

                const pShareStr = pShare.toFixed(1).replace('.', ',') + '%';

                const prodName = prod.item || 'Sem nome';

                

                productsHtml += 

                    '<div class="prod-bar-row">' +

                        '<div class="prod-bar-info">' +

                            '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:72%;">' + prodName + '</span>' +

                            '<span style="font-weight:700;color:' + accentColor + ';">' + pShareStr + '</span>' +

                        '</div>' +

                        '<div class="prod-bar-track">' +

                            '<div class="prod-bar-fill" style="width:' + pShare + '%;background:' + accentColor + ';box-shadow:0 0 6px ' + accentColor + '80;"></div>' +

                        '</div>' +

                    '</div>';

            });

            

            if (sortedProds.length > 4) {

                const othersFat = sortedProds.slice(4).reduce((sum, p) => sum + (p.faturamento||0), 0);

                const oShare = (othersFat / totalFaturamento) * 100;

                productsHtml += 

                    '<div class="prod-bar-row">' +

                        '<div class="prod-bar-info" style="color:#777;">' +

                            '<span>Outros Produtos</span>' +

                            '<span>' + oShare.toFixed(1).replace('.', ',') + '%</span>' +

                        '</div>' +

                        '<div class="prod-bar-track">' +

                            '<div class="prod-bar-fill" style="width:' + oShare + '%;background:#555;"></div>' +

                        '</div>' +

                    '</div>';

            }

        } else {

            productsHtml = '<div style="color:#666;font-size:0.85rem;">Sem produtos detalhados</div>';

        }



        const paisName = pais.item || 'DESCONHECIDO';



        html += 

            '<div class="pais-card">' +

                '<div class="pais-card-header" style="border-bottom-color:' + accentColor + '40;">' +

                    '<div style="display:flex;align-items:center;gap:10px;">' +

                        '<span style="font-size:1.6rem;">' + flag + '</span>' +

                        '<span style="font-weight:700;font-size:1.1rem;color:#fff;text-transform:uppercase;">' + paisName + '</span>' +

                    '</div>' +

                    '<div style="text-align:right;">' +

                        '<div style="font-size:0.7rem;color:#aaa;text-transform:uppercase;letter-spacing:0.5px;">Share Global</div>' +

                        '<div style="font-weight:800;font-size:1.5rem;color:' + accentColor + ';text-shadow:0 0 12px ' + accentColor + '80;">' + shareStr + '</div>' +

                    '</div>' +

                '</div>' +

                '<div class="pais-card-body">' +

                    '<div style="font-size:0.72rem;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Top Produtos Neste País</div>' +

                    productsHtml +

                '</div>' +

            '</div>';

    });

    

    container.innerHTML = html;

}



// ── Auto-Scroll Contínuo nas Tabelas (Modo TV) ───────────────────

const activeScrollIntervals = [];



function initTableAutoScroll() {

    activeScrollIntervals.forEach(timer => clearInterval(timer));

    activeScrollIntervals.length = 0;



    const scrollEls = document.querySelectorAll('.table-responsive-wrapper');

    scrollEls.forEach(container => {

        let isPaused = false;

        let direction = 1;



        container.addEventListener('mouseenter', () => { isPaused = true; });

        container.addEventListener('mouseleave', () => { isPaused = false; });

        container.addEventListener('touchstart', () => { isPaused = true; }, { passive: true });

        container.addEventListener('touchend',   () => { isPaused = false; }, { passive: true });



        const interval = setInterval(() => {

            if (isPaused) return;



            const maxScroll = container.scrollHeight - container.clientHeight;

            if (maxScroll <= 5) return; 



            if (direction === 1) {

                container.scrollTop += 0.8;

                if (container.scrollTop >= maxScroll - 2) {

                    isPaused = true;

                    setTimeout(() => {

                        container.scrollTo({ top: 0, behavior: 'smooth' });

                        setTimeout(() => { isPaused = false; }, 1200);

                    }, 2500);

                }

            }

        }, 35);



        activeScrollIntervals.push(interval);

    });

}

