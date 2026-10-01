/* ════════════════════════════════════════════════════════════════
   teste_estoque.js — Radar de Ruptura & Reabastecimento TV Diretoria
   MQ Design System — MQ Professional
   3 Telas TV:
     Tela 1: Pranchas & Secadores
     Tela 2: Modeladores & Escovas
     Tela 3: Escovas, Tesouras, Parlux & Máquinas
   ════════════════════════════════════════════════════════════════ */

'use strict';

// ── Estado Global ───────────────────────────────────────────────
let rawEstoqueData = [];
let metaInfo = {};
let currentScreenIndex = 0;
let searchQuery = '';
let tvRotationTimer = null;
let tvRotationIntervalSec = 120; // 2 minutos antes de trocar de tela
let tvRemainingSec = 120;
let isTvPaused = false;

// Filtro de Marcas - 8 Marcas oficiais sempre setadas por padrão
const DEFAULT_SELECTED_BRANDS = [
    'FORCE BARB',
    'MQ BEAUTY',
    'MQ COMEX',
    'MQ ESCOVAS',
    'MQ PRO',
    'MQ PROFESSIONAL',
    'MQ TESOURA',
    'PARLUX'
];
let allActiveBrands = [];
let selectedBrands = new Set();

// Estado de ordenação independente por bloco/categoria
// Default: Curva A -> Curva B -> Curva C, e maior consumo médio primeiro
const blockSortState = {};

// ── Configuração das 3 Telas TV ─────────────────────────────────
const SCREENS = [
    {
        id: 'tela1',
        name: 'Tela 1: Pranchas e Secadores',
        badge: 'TELA 1 — PRANCHAS E SECADORES',
        gridClass: 'tv-grid-2-blocks',
        categories: [
            {
                id: 'Pranchas',
                label: 'PRANCHAS',
                icon: '🔥',
                filter: (p) => p.CATEGORIA_SIMP === 'Pranchas'
            },
            {
                id: 'Secadores',
                label: 'SECADORES',
                icon: '💨',
                filter: (p) => p.CATEGORIA_SIMP === 'Secadores'
            }
        ]
    },
    {
        id: 'tela2',
        name: 'Tela 2: Modeladores & Escovas',
        badge: 'TELA 2 — MODELADORES & ESCOVAS',
        gridClass: 'tv-grid-2-blocks',
        categories: [
            {
                id: 'Modeladores',
                label: 'MODELADORES',
                icon: '🌀',
                filter: (p) => p.CATEGORIA_SIMP === 'Modeladores'
            },
            {
                id: 'Escovas',
                label: 'ESCOVAS',
                icon: '🖌️',
                filter: (p) => p.CATEGORIA_SIMP === 'Escovas' || p.CATEGORIA_SIMP === 'Escovas Elétricas' || String(p.GRUPO_SINTETICO || '').includes('ESCOVA')
            }
        ]
    },
    {
        id: 'tela3',
        name: 'Tela 3: Escovas, Parlux & Máquinas',
        badge: 'TELA 3 — ESCOVAS, PARLUX & MÁQUINAS',
        gridClass: 'tv-grid-3-blocks',
        categories: [
            {
                id: 'Escovas',
                label: 'ESCOVAS',
                icon: '🖌️',
                filter: (p) => p.CATEGORIA_SIMP === 'Escovas' || p.CATEGORIA_SIMP === 'Escovas Elétricas' || String(p.GRUPO_SINTETICO || '').includes('ESCOVA')
            },
            {
                id: 'Parlux',
                label: 'PARLUX',
                icon: '💎',
                filter: (p) => p.CATEGORIA_SIMP === 'Parlux'
            },
            {
                id: 'Maquinas',
                label: 'MÁQUINAS',
                icon: '⚡',
                filter: (p) => p.CATEGORIA_SIMP === 'Máquinas' || p.CATEGORIA_SIMP === 'Tesouras' || String(p.GRUPO_SINTETICO || '').includes('MAQUINA') || String(p.GRUPO_SINTETICO || '').includes('TESOURA')
            }
        ]
    }
];

// ── Navegação de Abas Globais ───────────────────────────────────
function navigateTab(path) {
    window.location.href = path;
}

// ── Formatadores Numéricos ──────────────────────────────────────
function fmtN(val) {
    if (val === null || val === undefined || val === '' || isNaN(Number(val))) return '0';
    return Number(val).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function fmtF(val, dec = 1) {
    if (val === null || val === undefined || val === '' || isNaN(Number(val))) return '0,0';
    return Number(val).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── Carga dos Dados via API ─────────────────────────────────────
async function loadTesteEstoqueData(forceRefresh = false) {
    const btn = document.getElementById('btn-refresh');
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';

    try {
        const url = forceRefresh ? '/api/teste_estoque?force=1' : '/api/teste_estoque';
        const res = await fetch(url);
        const text = await res.text();
        const cleanText = text.replace(/:\s*NaN\b/g, ': null').replace(/:\s*Infinity\b/g, ': 0');
        const json = JSON.parse(cleanText);

        if (json.success) {
            rawEstoqueData = json.data || [];
            metaInfo = json.meta || {};

            // Atualiza relógio
            const clockEl = document.getElementById('clock-text');
            if (clockEl) {
                clockEl.innerHTML = `<i class="fas fa-clock"></i> ${metaInfo.gerado_em || new Date().toLocaleTimeString('pt-BR')}`;
            }

            // Constrói filtro de marcas
            buildBrandDropdown(rawEstoqueData);

            renderCurrentScreen();
            startTvRotationTimer();
        } else {
            console.error('API Error:', json.error);
            showErrorMessage(json.error || 'Falha ao processar dados');
        }
    } catch (err) {
        console.error('Network Error:', err);
        showErrorMessage(err.message || err);
    } finally {
        if (btn) btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
    }
}

function showErrorMessage(msg) {
    const container = document.getElementById('tv-screens-container');
    if (container) {
        container.innerHTML = `
            <div style="padding: 40px; text-align: center; color: var(--risk-critical); font-size: 16px;">
                <i class="fas fa-triangle-exclamation" style="font-size: 32px; margin-bottom: 12px; display: block;"></i>
                Erro ao carregar dados: ${msg}.<br>
                <button class="btn-refresh-primary" style="margin-top: 16px;" onclick="loadTesteEstoqueData(true)">
                    <i class="fas fa-sync-alt"></i> Tentar Novamente
                </button>
            </div>
        `;
    }
}

// ── Filtro de Marcas (Dropdown Interativo) ──────────────────────
function buildBrandDropdown(data) {
    const listEl = document.getElementById('brand-options-list');
    if (!listEl) return;

    // Apenas marcas ativas de produtos acabados (sem marcas de peças "SP ...")
    const brandsSet = new Set();
    data.forEach(p => {
        const m = String(p.MARCA || '').trim();
        if (m && !m.toUpperCase().startsWith('SP ') && !m.toUpperCase().startsWith('SPARE')) {
            brandsSet.add(m);
        }
    });

    allActiveBrands = Array.from(brandsSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    // DEIXAR SEMPRE SETADAS AS 8 MARCAS OFICIAIS SOLICITADAS:
    // FORCE BARB, MQ BEAUTY, MQ COMEX, MQ ESCOVAS, MQ PRO, MQ PROFESSIONAL, MQ TESOURA, PARLUX
    const defaultUpper = DEFAULT_SELECTED_BRANDS.map(b => b.toUpperCase().trim());
    selectedBrands = new Set();
    allActiveBrands.forEach(b => {
        if (defaultUpper.includes(b.toUpperCase().trim())) {
            selectedBrands.add(b);
        }
    });

    let html = '';
    allActiveBrands.forEach(b => {
        const isChecked = selectedBrands.has(b);
        html += `
            <label class="brand-check-item">
                <input type="checkbox" value="${b}" ${isChecked ? 'checked' : ''} onchange="onBrandCheckboxChange('${b}', this.checked)">
                <span>${b}</span>
            </label>
        `;
    });
    listEl.innerHTML = html;

    const checkAll = document.getElementById('check-all-brands');
    if (checkAll) {
        checkAll.checked = (selectedBrands.size === allActiveBrands.length);
    }

    updateBrandFilterLabel();
}

function toggleBrandDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('menu-brand-filter');
    if (menu) {
        const isHidden = (menu.style.display === 'none' || !menu.style.display);
        menu.style.display = isHidden ? 'flex' : 'none';
    }
}

document.addEventListener('click', (e) => {
    const wrap = document.getElementById('brand-filter-wrap');
    const menu = document.getElementById('menu-brand-filter');
    if (wrap && menu && !wrap.contains(e.target)) {
        menu.style.display = 'none';
    }
});

function toggleAllBrands(isChecked) {
    if (isChecked) {
        selectedBrands = new Set(allActiveBrands);
    } else {
        selectedBrands.clear();
    }
    const checkboxes = document.querySelectorAll('#brand-options-list input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = isChecked);

    updateBrandFilterLabel();
    renderCurrentScreen();
}

function onBrandCheckboxChange(brand, isChecked) {
    if (isChecked) {
        selectedBrands.add(brand);
    } else {
        selectedBrands.delete(brand);
    }

    const checkAll = document.getElementById('check-all-brands');
    if (checkAll) {
        checkAll.checked = (selectedBrands.size === allActiveBrands.length);
    }

    updateBrandFilterLabel();
    renderCurrentScreen();
}

function updateBrandFilterLabel() {
    const lbl = document.getElementById('lbl-brand-filter');
    if (!lbl) return;

    if (selectedBrands.size === 0) {
        lbl.textContent = 'Nenhuma Marca';
    } else if (selectedBrands.size === allActiveBrands.length) {
        lbl.textContent = 'Todas as Marcas';
    } else if (selectedBrands.size === 1) {
        lbl.textContent = Array.from(selectedBrands)[0];
    } else {
        lbl.textContent = `${selectedBrands.size} Marcas`;
    }
}

// ── Alternância de Tela TV ──────────────────────────────────────
function switchTvScreen(index) {
    if (index < 0 || index >= SCREENS.length) index = 0;
    currentScreenIndex = index;

    // Atualiza botões do seletor
    document.querySelectorAll('.screen-tab-btn').forEach((btn, idx) => {
        if (idx === currentScreenIndex) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Reinicia contagem da rotação
    tvRemainingSec = tvRotationIntervalSec;
    updateTvCountdownDisplay();

    renderCurrentScreen();
}

function toggleTvRotation() {
    isTvPaused = !isTvPaused;
    const btn = document.getElementById('btn-tv-pause');
    if (btn) {
        if (isTvPaused) {
            btn.innerHTML = '<i class="fas fa-play"></i>';
            btn.title = 'Retomar rotação automática';
            btn.classList.add('paused');
        } else {
            btn.innerHTML = '<i class="fas fa-pause"></i>';
            btn.title = 'Pausar rotação automática';
            btn.classList.remove('paused');
        }
    }
}

function startTvRotationTimer() {
    if (tvRotationTimer) clearInterval(tvRotationTimer);
    tvRemainingSec = tvRotationIntervalSec;
    updateTvCountdownDisplay();

    tvRotationTimer = setInterval(() => {
        if (isTvPaused) return;

        tvRemainingSec--;
        if (tvRemainingSec <= 0) {
            tvRemainingSec = tvRotationIntervalSec;
            const nextIndex = (currentScreenIndex + 1) % SCREENS.length;
            switchTvScreen(nextIndex);
        } else {
            updateTvCountdownDisplay();
        }
    }, 1000);
}

function updateTvCountdownDisplay() {
    const el = document.getElementById('tv-countdown');
    if (el) {
        if (tvRemainingSec >= 60) {
            const m = Math.floor(tvRemainingSec / 60);
            const s = tvRemainingSec % 60;
            el.textContent = `${m}m ${s < 10 ? '0' : ''}${s}s`;
        } else {
            el.textContent = `${tvRemainingSec}s`;
        }
    }
}

// ── Busca de Produtos ───────────────────────────────────────────
function onSearchInput(val) {
    searchQuery = (val || '').trim().toLowerCase();
    renderCurrentScreen();
}

// ── Renderização da Tela Atual ──────────────────────────────────
function renderCurrentScreen() {
    const container = document.getElementById('tv-screens-container');
    if (!container) return;

    const screenConfig = SCREENS[currentScreenIndex];
    if (!screenConfig) return;

    let html = `
        <div class="tv-screen-view ${screenConfig.gridClass}" id="screen-view-${screenConfig.id}">
    `;

    screenConfig.categories.forEach(cat => {
        html += renderCategoryBlock(cat);
    });

    html += `</div>`;
    container.innerHTML = html;

    // Inicializa auto-scroll para cada bloco de tabela renderizado
    initTableAutoScroll();
}

// ── Renderização de um Bloco de Categoria ────────────────────────
function renderCategoryBlock(cat) {
    // 1. Filtrar produtos da categoria
    let prods = rawEstoqueData.filter(cat.filter);

    // 2. Filtro estrito: eliminar peças de reposição e produtos zero em todas as colunas
    prods = prods.filter(p => {
        const marca = String(p.MARCA || '').trim().toUpperCase();
        // Não mostrar marcas de peças (SP MQ PRO, SP PARLUX, etc.) nas categorias de produtos acabados
        if (marca.startsWith('SP ') || marca.startsWith('SPARE')) return false;

        const med = Number(p.MEDIA_CONSUMO || 0);
        const vMes = Number(p.VENDA_MES_ATUAL || 0);
        const estEmp = Number(p.ESTOQUE_EMPRESA || 0);
        const estMcr = Number(p.ESTOQUE_MCR || 0);
        // Não mostrar quando o produto for zero em todas as colunas
        if (med === 0 && vMes === 0 && estEmp === 0 && estMcr === 0) return false;

        return true;
    });

    // 3. Filtro de Marcas selecionadas (case-insensitive para compatibilidade perfeita)
    if (selectedBrands.size === 0) {
        prods = [];
    } else if (selectedBrands.size < allActiveBrands.length) {
        const selUpper = new Set(Array.from(selectedBrands).map(b => b.toUpperCase().trim()));
        prods = prods.filter(p => selUpper.has(String(p.MARCA || '').toUpperCase().trim()));
    }

    // 4. Filtro de busca se houver
    if (searchQuery) {
        prods = prods.filter(p => {
            const cod = String(p.CODPROD || '').toLowerCase();
            const nome = String(p.NOME_PRODUTO || '').toLowerCase();
            const marca = String(p.MARCA || '').toLowerCase();
            return cod.includes(searchQuery) || nome.includes(searchQuery) || marca.includes(searchQuery);
        });
    }

    // 5. Ordenação independente do bloco (Padrão: ESTOQUE MCR do maior para o menor em todas as guias)
    const sort = blockSortState[cat.id] || { col: 'ESTOQUE_MCR', dir: 'desc' };
    prods = sortProducts(prods, sort.col, sort.dir);

    // 6. Totais e Contagens do Bloco
    const totalSkus = prods.length;
    const countCurvaA = prods.filter(p => (p.CURVA || 'C') === 'A').length;
    const countCurvaB = prods.filter(p => (p.CURVA || 'C') === 'B').length;
    const countCurvaC = prods.filter(p => (p.CURVA || 'C') === 'C').length;
    const countRuptura = prods.filter(p => Number(p.DIAS_ESTOQUE_TOTAL || 0) === 0).length;

    const totMediaConsumo = prods.reduce((acc, p) => acc + Number(p.MEDIA_CONSUMO || 0), 0);
    const totVendaMes = prods.reduce((acc, p) => acc + Number(p.VENDA_MES_ATUAL || 0), 0);
    const totEstoqueEmpresa = prods.reduce((acc, p) => acc + Number(p.ESTOQUE_EMPRESA || 0), 0);
    const totEstoqueMcr = prods.reduce((acc, p) => acc + Number(p.ESTOQUE_MCR || 0), 0);

    // 7. Linhas da Tabela
    let rowsHtml = '';
    if (prods.length === 0) {
        rowsHtml = `
            <tr>
                <td colspan="11" class="empty-table-msg">
                    <i class="fas fa-box-open"></i> Nenhum produto ativo nesta categoria
                </td>
            </tr>
        `;
    } else {
        prods.forEach(p => {
            const dias = Number(p.DIAS_ESTOQUE_TOTAL || 0);
            const isZeroDays = (dias === 0);

            // Animação de piscar para 0 dias de estoque
            const diasBadgeClass = isZeroDays ? 'badge-dias blink-zero-days' : (dias <= 15 ? 'badge-dias dias-critico' : (dias <= 30 ? 'badge-dias dias-atencao' : 'badge-dias dias-ok'));

            // Curva ABC
            const curva = (p.CURVA || 'C').toUpperCase();
            const curvaBadgeClass = `badge-curva curva-${curva.toLowerCase()}`;

            // Previsão de Ruptura
            const prevRuptura = p.PREVISAO_RUPTURA || (isZeroDays ? 'Imediata' : '—');
            const prevBadgeClass = getPrevisaoBadgeClass(prevRuptura, dias);

            // Status Badge
            const statusLabel = p.STATUS_RUPTURA_LABEL || (isZeroDays ? 'Ruptura Geral' : 'Estoque Saudável');
            const statusClass = getStatusClass(p.STATUS_RUPTURA);

            rowsHtml += `
                <tr class="${isZeroDays ? 'row-zero-days' : ''}">
                    <td class="td-center">
                        <span class="${curvaBadgeClass}">${curva}</span>
                    </td>
                    <td class="td-center td-cod">${p.CODPROD || '—'}</td>
                    <td class="td-nome" title="${p.NOME_PRODUTO || ''}">
                        <div class="prod-nome-text">${p.NOME_PRODUTO || '—'}</div>
                    </td>
                    <td class="td-center td-num td-highlight-media">${fmtN(p.MEDIA_CONSUMO)}</td>
                    <td class="td-center td-num">${fmtN(p.VENDA_MES_ATUAL)}</td>
                    <td class="td-center td-num td-bold">${fmtN(p.ESTOQUE_EMPRESA)}</td>
                    <td class="td-center">
                        <span class="${diasBadgeClass}">${fmtN(dias)}d</span>
                    </td>
                    <td class="td-center">
                        <span class="badge-prev ${prevBadgeClass}">
                            <i class="fas fa-calendar-alt"></i> ${prevRuptura}
                        </span>
                    </td>
                    <td class="td-center td-num td-sc">${fmtN(p.ESTOQUE_MCR)}</td>
                    <td class="td-center td-num">${fmtF(p.GIRO_ESTOQUE, 1)}</td>
                    <td class="td-center td-status">
                        <span class="badge-status ${statusClass}">${statusLabel}</span>
                    </td>
                </tr>
            `;
        });
    }

    // Helper de ordenação para cabeçalhos
    const getSortIcon = (col) => {
        if (sort.col !== col) return '<i class="fas fa-sort sort-muted"></i>';
        return sort.dir === 'asc' ? '<i class="fas fa-sort-up sort-active"></i>' : '<i class="fas fa-sort-down sort-active"></i>';
    };

    return `
        <div class="tv-cat-block" id="block-${cat.id}">
            <!-- CABEÇALHO DO BLOCO -->
            <div class="tv-cat-header">
                <div class="cat-title-wrap">
                    <span class="cat-icon">${cat.icon}</span>
                    <span class="cat-title">${cat.label}</span>
                    <span class="cat-sku-count">${totalSkus} SKUs</span>
                </div>

                <div class="cat-curva-pills">
                    <span class="curva-pill pill-a" title="Curva A: 80% do volume">A: <strong>${countCurvaA}</strong></span>
                    <span class="curva-pill pill-b" title="Curva B: 15% do volume">B: <strong>${countCurvaB}</strong></span>
                    <span class="curva-pill pill-c" title="Curva C: 5% do volume">C: <strong>${countCurvaC}</strong></span>
                    ${countRuptura > 0 ? `<span class="curva-pill pill-ruptura blink-pill" title="Produtos com 0 dias de estoque">🚨 0d: <strong>${countRuptura}</strong></span>` : ''}
                </div>
            </div>

            <!-- TABELA DO BLOCO -->
            <div class="tv-table-wrapper">
                <div class="tv-table-scroll" id="scroll-${cat.id}">
                    <table class="tv-table" id="table-${cat.id}">
                        <thead>
                            <tr>
                                <th style="width: 36px; text-align: center;" onclick="toggleBlockSort('${cat.id}', 'CURVA_ORDER')" title="Ordenar por Curva ABC">
                                    CURVA ${getSortIcon('CURVA_ORDER')}
                                </th>
                                <th style="width: 44px; text-align: center;" onclick="toggleBlockSort('${cat.id}', 'CODPROD')" title="Ordenar por Código">
                                    CÓD. ${getSortIcon('CODPROD')}
                                </th>
                                <th style="text-align: left; padding-left: 8px;" onclick="toggleBlockSort('${cat.id}', 'NOME_PRODUTO')" title="Ordenar por Produto">
                                    PRODUTO ${getSortIcon('NOME_PRODUTO')}
                                </th>
                                <th style="width: 58px; text-align: center;" onclick="toggleBlockSort('${cat.id}', 'MEDIA_CONSUMO')" title="Ordenar por Média de Consumo">
                                    MÉDIA<br>CONSUMO ${getSortIcon('MEDIA_CONSUMO')}
                                </th>
                                <th style="width: 58px; text-align: center;" onclick="toggleBlockSort('${cat.id}', 'VENDA_MES_ATUAL')" title="Ordenar por Vendas no Mês">
                                    VENDA<br>MÊS ATUAL ${getSortIcon('VENDA_MES_ATUAL')}
                                </th>
                                <th style="width: 62px; text-align: center;" onclick="toggleBlockSort('${cat.id}', 'ESTOQUE_EMPRESA')" title="Ordenar por Estoque Empresa">
                                    ESTOQUE<br>EMPRESA ${getSortIcon('ESTOQUE_EMPRESA')}
                                </th>
                                <th style="width: 62px; text-align: center;" onclick="toggleBlockSort('${cat.id}', 'DIAS_ESTOQUE_TOTAL')" title="Ordenar por Dias de Estoque Conforme Consumo">
                                    DIAS EST.<br><small style="font-size: 7.5px; opacity: 0.85; font-weight: 600;">(CONSUMO)</small> ${getSortIcon('DIAS_ESTOQUE_TOTAL')}
                                </th>
                                <th style="width: 68px; text-align: center;" onclick="toggleBlockSort('${cat.id}', 'PREVISAO_RUPTURA')" title="Ordenar por Previsão de Ruptura">
                                    PREV.<br>RUPTURA ${getSortIcon('PREVISAO_RUPTURA')}
                                </th>
                                <th style="width: 58px; text-align: center;" onclick="toggleBlockSort('${cat.id}', 'ESTOQUE_MCR')" title="Ordenar por Estoque MCR">
                                    ESTOQUE<br>MCR ${getSortIcon('ESTOQUE_MCR')}
                                </th>
                                <th style="width: 38px; text-align: center;" onclick="toggleBlockSort('${cat.id}', 'GIRO_ESTOQUE')" title="Ordenar por Giro">
                                    GIRO ${getSortIcon('GIRO_ESTOQUE')}
                                </th>
                                <th style="width: 78px; text-align: center;">
                                    STATUS
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" style="text-align: left; font-weight: 700; color: var(--gold); padding-left: 6px;">
                                    TOTAL ${cat.label} (${totalSkus} SKUs)
                                </td>
                                <td class="td-center td-num" style="font-weight: 700; color: #fff;">${fmtN(totMediaConsumo)}</td>
                                <td class="td-center td-num" style="font-weight: 700; color: #fff;">${fmtN(totVendaMes)}</td>
                                <td class="td-center td-num" style="font-weight: 700; color: #fff;">${fmtN(totEstoqueEmpresa)}</td>
                                <td class="td-center">—</td>
                                <td class="td-center">—</td>
                                <td class="td-center td-num" style="font-weight: 700; color: var(--accent-cyan);">${fmtN(totEstoqueMcr)}</td>
                                <td class="td-center">—</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ── Lógica de Ordenação ─────────────────────────────────────────
function toggleBlockSort(catId, col) {
    const current = blockSortState[catId] || { col: 'DEFAULT', dir: 'asc' };

    let newDir = 'asc';
    if (current.col === col) {
        newDir = current.dir === 'asc' ? 'desc' : 'asc';
    } else {
        // Para métricas de consumo/estoque, default inicial é decrescente
        if (['MEDIA_CONSUMO', 'VENDA_MES_ATUAL', 'ESTOQUE_EMPRESA', 'ESTOQUE_MCR', 'GIRO_ESTOQUE'].includes(col)) {
            newDir = 'desc';
        } else {
            newDir = 'asc';
        }
    }

    blockSortState[catId] = { col, dir: newDir };
    renderCurrentScreen();
}

function sortProducts(list, col, dir) {
    const sorted = [...list];

    // Ordem Padrão da Empresa: Curva A -> Curva B -> Curva C, e maior consumo médio
    if (col === 'DEFAULT' || col === 'CURVA_ORDER') {
        const orderMap = { 'A': 1, 'B': 2, 'C': 3 };
        sorted.sort((a, b) => {
            const cA = orderMap[(a.CURVA || 'C').toUpperCase()] || 3;
            const cB = orderMap[(b.CURVA || 'C').toUpperCase()] || 3;
            if (cA !== cB) {
                return dir === 'asc' ? (cA - cB) : (cB - cA);
            }
            return Number(b.MEDIA_CONSUMO || 0) - Number(a.MEDIA_CONSUMO || 0);
        });
        return sorted;
    }

    sorted.sort((a, b) => {
        let vA = a[col];
        let vB = b[col];

        if (typeof vA === 'string') {
            const cmp = String(vA).localeCompare(String(vB), 'pt-BR', { numeric: true, sensitivity: 'base' });
            return dir === 'asc' ? cmp : -cmp;
        }

        vA = Number(vA || 0);
        vB = Number(vB || 0);
        return dir === 'asc' ? (vA - vB) : (vB - vA);
    });

    return sorted;
}

// ── Badges e Classes de Status ──────────────────────────────────
function getPrevisaoBadgeClass(prev, dias) {
    if (dias <= 0 || String(prev).includes('Imediata')) return 'prev-critico';
    if (dias <= 30) return 'prev-critico';
    if (dias <= 60) return 'prev-atencao';
    if (dias <= 120) return 'prev-alerta';
    if (dias <= 365) return 'prev-seguro';
    return 'prev-alto';
}

function getStatusClass(status) {
    switch (status) {
        case 'RUPTURA_TOTAL':
        case 'CRITICO_GERAL':
            return 'status-critico';
        case 'REPOR_URGENTE_MCR':
        case 'REPOR_MCR':
        case 'TRANSFERE_PBI':
            return 'status-repor';
        case 'ATENCAO_GERAL':
            return 'status-atencao';
        case 'SAUDAVEL':
            return 'status-saudavel';
        default:
            return 'status-neutro';
    }
}

// ── Auto-Scroll Contínuo nas Tabelas (Modo TV) ───────────────────
const activeScrollIntervals = [];

function initTableAutoScroll() {
    // Limpa intervalos anteriores
    activeScrollIntervals.forEach(timer => clearInterval(timer));
    activeScrollIntervals.length = 0;

    const scrollEls = document.querySelectorAll('.tv-table-scroll');
    scrollEls.forEach(container => {
        let isPaused = false;
        let direction = 1; // 1 = descendo, -1 = subindo

        container.addEventListener('mouseenter', () => { isPaused = true; });
        container.addEventListener('mouseleave', () => { isPaused = false; });
        container.addEventListener('touchstart', () => { isPaused = true; }, { passive: true });
        container.addEventListener('touchend',   () => { isPaused = false; }, { passive: true });

        const interval = setInterval(() => {
            if (isPaused) return;

            const maxScroll = container.scrollHeight - container.clientHeight;
            if (maxScroll <= 5) return; // Não precisa rolar se couber tudo

            if (direction === 1) {
                container.scrollTop += 0.8;
                if (container.scrollTop >= maxScroll - 2) {
                    isPaused = true;
                    setTimeout(() => {
                        // Volta suavemente ao topo
                        container.scrollTo({ top: 0, behavior: 'smooth' });
                        setTimeout(() => { isPaused = false; }, 1200);
                    }, 2500);
                }
            }
        }, 35);

        activeScrollIntervals.push(interval);
    });
}

// ── Inicialização ao Carregar ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadTesteEstoqueData();

    // Auto-refresh dos dados do Oracle a cada 10 minutos (600.000 ms)
    const ORACLE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
    setInterval(() => {
        console.log('[AUTO-REFRESH ORACLE] Atualizando dados de estoque do Oracle a cada 10 minutos...');
        loadTesteEstoqueData(true);
    }, ORACLE_REFRESH_INTERVAL_MS);
});
