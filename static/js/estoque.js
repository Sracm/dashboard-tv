/* ════════════════════════════════════════════════════════════════
   estoque.js  —  Análise de Demanda e Reabastecimento
   Dashboard TV · MQ Hair
   ════════════════════════════════════════════════════════════════ */

'use strict';

let estoqueData = [];
let metaLabels  = { label_ma: 'Mês Atual', label_m1: 'M-1', label_m2: 'M-2', label_m3: 'M-3' };

// Estado de expansão das seções
const secaoAberta = {};

// Estado de ordenação da tabela
// col = nome do campo (ex.: 'QTD_VENDAS_MES'); dir = 'asc' | 'desc'
let currentSort = { col: null, dir: 'asc' };

// Colunas cujo padrão inicial é decrescente (maiores valores primeiro)
const SORT_DESC_FIRST = new Set([
    'QTD_VENDAS_MES', 'QTD_M1', 'QTD_M2', 'QTD_M3',
    'MEDIA_CONSUMO', 'VENDA_MEDIA_DIARIA',
    'SALDO_EMPRESA', 'SALDO_MCM', 'SIRO_ESTOQUE', 'TT_TRANSFERIR'
]);

// O cabeçalho usa MEDIA_CONSUMO, mas o campo da API é VENDA_MEDIA_DIARIA
const SORT_FIELD_ALIAS = { MEDIA_CONSUMO: 'VENDA_MEDIA_DIARIA' };

function setSort(col) {
    if (currentSort.col === col) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.col = col;
        currentSort.dir = SORT_DESC_FIRST.has(col) ? 'desc' : 'asc';
    }
    updateSortIcons();
    renderTable(estoqueData);
}

function updateSortIcons() {
    document.querySelectorAll('.sort-icon').forEach(el => {
        const col = el.id.replace('sort-', '');
        el.textContent = (col === currentSort.col)
            ? (currentSort.dir === 'asc' ? '▲' : '▼')
            : '';
        el.style.color = (col === currentSort.col) ? '#f5c518' : '#64748b';
    });
}

// Comparador: numérico quando ambos os valores são numéricos, senão texto
function compareRows(a, b, col, dir) {
    const field = SORT_FIELD_ALIAS[col] || col;
    let va = a[field], vb = b[field];

    const na = Number(va), nb = Number(vb);
    const bothNum = va !== null && va !== '' && vb !== null && vb !== '' &&
                    !isNaN(na) && !isNaN(nb);

    let res;
    if (bothNum) {
        res = na === nb ? 0 : (na > nb ? 1 : -1);
    } else {
        res = String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR', { numeric: true });
    }
    return dir === 'asc' ? res : -res;
}

// ── Navegação ──────────────────────────────────────────────────
function navigateTab(path) {
    window.location.href = path === '/tv' ? '/tv' : path;
}

// ── Formatação ─────────────────────────────────────────────────
function fmtN(n) {
    if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '—';
    const v = Number(n);
    if (v === 0) return '0';
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
function fmtF(n, dec = 1) {
    if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── Mapeamento de Categoria Simplificada ───────────────────────
const CATEGORIA_ORDER = [
    'Prancha',
    'Secador',
    'Modelador',
    'Máquina Corte',
    'Escova Elétrica',
    'Escova',
    'Tesoura',
    'Parlux',
    'Silenciador',
    'Spare Parts',
    'Outros'
];

const CATEGORIA_ICON = {
    'Prancha':         '🔥',
    'Secador':         '💨',
    'Modelador':       '🌀',
    'Escova Elétrica': '🔌',
    'Máquina Corte':   '✂️',
    'Escova':          '🖌️',
    'Tesoura':         '✂',
    'Parlux':          '💎',
    'Silenciador':     '🔇',
    'Spare Parts':     '🔧',
    'Outros':          '📦'
};

const CATEGORIA_COLOR = {
    'Prancha':         '#f5c518',
    'Secador':         '#4fc3f7',
    'Modelador':       '#ce93d8',
    'Escova Elétrica': '#ff8a65',
    'Máquina Corte':   '#ef5350',
    'Escova':          '#66bb6a',
    'Tesoura':         '#26c6da',
    'Parlux':          '#e91e63',
    'Silenciador':     '#78909c',
    'Spare Parts':     '#ffa726',
    'Outros':          '#546e7a'
};

function mapCategoria(cat) {
    if (!cat) return 'Outros';
    const c = cat.toUpperCase().trim();
    if (c.includes('PARLUX'))                                     return 'Parlux';
    if (c.includes('PRANCHA'))                                    return 'Prancha';
    if (c.includes('SECADOR'))                                    return 'Secador';
    if (c.includes('MODELADOR'))                                  return 'Modelador';
    if (c.includes('ESCOVA ELETRICA') || c.includes('ESCOVA ELÉTRICA') ||
        (c.includes('ESCOVA') && c.includes('DIGITAL')) ||
        c.includes('ESC MQ BEAUTY') || c.includes('ESCOVAS ELETRICA')) return 'Escova Elétrica';
    if (c.includes('MAQUINA') || c.includes('MÁQUINA') ||
        c.includes('CORTE') || c.includes('CLIPPER'))             return 'Máquina Corte';
    if (c.includes('ESCOVA'))                                     return 'Escova';
    if (c.includes('TESOURA'))                                    return 'Tesoura';
    if (c.includes('SILENCIADOR') || c.includes('SILENC'))        return 'Silenciador';
    if (c.includes('SPARE') || c.includes('SP MQ') || c.includes('PECAS')) return 'Spare Parts';
    return 'Outros';
}

// ── Dropdown genérico ──────────────────────────────────────────
function toggleDrop(type) {
    const menu = document.getElementById('menu-' + type);
    const btn  = document.querySelector(`#ms-${type} .ms-btn`);
    if (!menu) return;

    const isOpen = menu.style.display === 'block';

    ['empresa', 'marca', 'categoria', 'sintetico'].forEach(t => {
        const m = document.getElementById('menu-' + t);
        if (m) m.style.display = 'none';
    });

    if (!isOpen && btn) {
        const rect = btn.getBoundingClientRect();
        menu.style.top  = (rect.bottom + 4) + 'px';
        menu.style.left = rect.left + 'px';
        menu.style.display = 'block';
    }
}

function toggleAll(type, checked) {
    const container = document.getElementById('opts-' + type);
    if (!container) return;
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = checked);
    updateLabel(type);
    filterTable();
}

function updateLabel(type) {
    const container = document.getElementById('opts-' + type);
    const label     = document.getElementById('lbl-' + type);
    if (!container || !label) return;
    const all     = container.querySelectorAll('input[type="checkbox"]');
    const checked = Array.from(all).filter(c => c.checked);
    const labels  = { empresa: 'Todas Empresas', marca: 'Todas Marcas', categoria: 'Todos Grupos', sintetico: 'Todos Sintéticos' };
    if (checked.length === all.length && all.length > 0) {
        label.textContent = labels[type] || 'Todos';
    } else if (checked.length === 0) {
        label.textContent = 'Nenhum';
    } else if (checked.length === 1) {
        label.textContent = checked[0].value.slice(0, 22);
    } else {
        label.textContent = checked.length + ' selecionados';
    }
}

function getSelected(type) {
    const container = document.getElementById('opts-' + type);
    if (!container) return [];
    return Array.from(container.querySelectorAll('input:checked')).map(c => c.value);
}

document.addEventListener('click', e => {
    if (!e.target.closest('.ms-wrap')) {
        ['empresa', 'marca', 'categoria', 'sintetico'].forEach(t => {
            const m = document.getElementById('menu-' + t);
            if (m) m.style.display = 'none';
        });
    }
});

// ── Preencher dropdowns ────────────────────────────────────────
function buildDropdown(type, data, field) {
    const container = document.getElementById('opts-' + type);
    const allCb     = document.getElementById('all-' + type);
    if (!container) return;

    const prev    = getSelected(type);
    const hadPrev = prev.length > 0;

    const vals = [...new Set(data.map(r => (r[field] || 'SEM GRUPO').toString().trim()))].filter(Boolean).sort();
    container.innerHTML = '';

    vals.forEach(v => {
        const lbl = document.createElement('label');
        const cb  = document.createElement('input');
        cb.type  = 'checkbox';
        cb.value = v;
        cb.checked = hadPrev ? prev.includes(v) : true;
        cb.onchange = () => {
            const allChecked = Array.from(container.querySelectorAll('input')).every(c => c.checked);
            if (allCb) allCb.checked = allChecked;
            updateLabel(type);
            filterTable();
        };
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(' ' + v));
        container.appendChild(lbl);
    });

    updateLabel(type);
}

function buildAllDropdowns(data) {
    buildDropdown('marca',     data, 'MARCA');
    buildDropdown('categoria', data, 'CATEGORIA');
    buildDropdown('sintetico', data, 'GRUPO_SINTETICO');
}

// ── Actualizar cabeçalhos ──────────────────────────────────────
function updateHeaderLabels() {
    const th_ma = document.getElementById('th-ma');
    const th_m1 = document.getElementById('th-m1');
    const th_m2 = document.getElementById('th-m2');
    const th_m3 = document.getElementById('th-m3');
    // mantém o <span class="sort-icon"> — sem ele setSort/updateSortIcons perdem o indicador
    const setTh = (th, label, col) => {
        if (!th) return;
        th.innerHTML = `VENDA <span class="th-sub">${label}</span> <span class="sort-icon" id="sort-${col}"></span>`;
    };
    setTh(th_ma, metaLabels.label_ma, 'QTD_VENDAS_MES');
    setTh(th_m1, metaLabels.label_m1, 'QTD_M1');
    setTh(th_m2, metaLabels.label_m2, 'QTD_M2');
    setTh(th_m3, metaLabels.label_m3, 'QTD_M3');
    updateSortIcons();
}

// ── Construir linha de produto ─────────────────────────────────
function buildProductRow(row) {
    const dias     = Number(row.DIAS_COBERTURA);
    const saldoEmp = Number(row.SALDO_EMPRESA)  || 0;
    const saldoMcm = Number(row.SALDO_MCM)      || 0;
    const tt       = Number(row.TT_TRANSFERIR)   || 0;

    let badgeClass, badgeText, trClass = '';
    if (dias === 9999 || Number(row.VENDA_MEDIA_DIARIA) === 0) {
        badgeClass = 'badge-gray';   badgeText = 'S/ Venda';
    } else if (dias <= 10) {
        badgeClass = 'badge-critic'; badgeText = `⚠ ${dias}d`; trClass = 'critical';
    } else if (dias <= 30) {
        badgeClass = 'badge-warn';   badgeText = `${dias}d`;    trClass = 'warning';
    } else {
        badgeClass = 'badge-ok';     badgeText = `${dias}d`;
    }

    const ttBadge = tt > 0
        ? `<span class="badge-dias badge-transfer">${fmtN(tt)}</span>`
        : '<span style="color:#374151">—</span>';

    return `<tr class="${trClass}">
        <td class="num prod-code">${row.CODPROD || ''}</td>
        <td class="td-left">
            <div class="prod-name">${row.NOME_PRODUTO || '—'}</div>
            <div class="prod-tag">${(row.MARCA || '').trim()} · ${(row.GRUPO_SINTETICO || '').trim()}</div>
        </td>
        <td class="num">${fmtN(row.QTD_VENDAS_MES)}</td>
        <td class="num">${fmtN(row.QTD_M1)}</td>
        <td class="num">${fmtN(row.QTD_M2)}</td>
        <td class="num">${fmtN(row.QTD_M3)}</td>
        <td class="num" style="color:#90caf9">${fmtF(row.VENDA_MEDIA_DIARIA, 2)}</td>
        <td class="num" style="font-weight:700">${fmtN(saldoEmp)}</td>
        <td class="center"><span class="badge-dias ${badgeClass}">${badgeText}</span></td>
        <td class="num" style="color:#a5d6a7">${fmtN(saldoMcm)}</td>
        <td class="num" style="color:#ffcc80">${fmtN(row.SIRO_ESTOQUE)}</td>
        <td class="center">${ttBadge}</td>
    </tr>`;
}

// ── Renderizar tabela agrupada por categoria ───────────────────
function renderTable(data) {
    const tbody = document.getElementById('tbl-body');
    if (!tbody) return;

    const search   = (document.getElementById('search-input')?.value || '').toLowerCase();
    const selMarca = getSelected('marca');
    const selCat   = getSelected('categoria');
    const selSint  = getSelected('sintetico');

    const totalMarca = document.querySelectorAll('#opts-marca input').length;
    const totalCat   = document.querySelectorAll('#opts-categoria input').length;
    const totalSint  = document.querySelectorAll('#opts-sintetico input').length;

    const filtered = data.filter(row => {
        const marca  = (row.MARCA            || '').toString().trim();
        const cat    = (row.CATEGORIA        || 'SEM GRUPO').toString().trim();
        const sint   = (row.GRUPO_SINTETICO  || 'SEM GRUPO').toString().trim();
        const cod    = String(row.CODPROD    || '');
        const nome   = (row.NOME_PRODUTO     || '').toString();

        const allMarca = selMarca.length === 0 || selMarca.length >= totalMarca;
        const allCat   = selCat.length   === 0 || selCat.length   >= totalCat;
        const allSint  = selSint.length  === 0 || selSint.length  >= totalSint;

        const matchMrk  = allMarca || selMarca.includes(marca);
        const matchCat  = allCat   || selCat.includes(cat);
        const matchSint = allSint  || selSint.includes(sint);
        const matchTxt  = !search  || cod.includes(search) || nome.toLowerCase().includes(search) || marca.toLowerCase().includes(search);

        return matchMrk && matchCat && matchSint && matchTxt;
    });

    // ── KPIs ──
    let totalEstqEmp = 0, totalEstqMcm = 0, totalCriticos = 0, totalAtencao = 0, totalTransfer = 0;
    filtered.forEach(r => {
        totalEstqEmp  += Number(r.SALDO_EMPRESA)  || 0;
        totalEstqMcm  += Number(r.SALDO_MCM)      || 0;
        totalTransfer += Number(r.TT_TRANSFERIR)   || 0;
        const dias = Number(r.DIAS_COBERTURA);
        if (dias <= 10 && dias !== 9999) totalCriticos++;
        else if (dias <= 30 && dias !== 9999) totalAtencao++;
    });

    const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setKpi('kpi-total',    fmtN(filtered.length));
    setKpi('kpi-estq-emp', fmtN(totalEstqEmp));
    setKpi('kpi-estq-mcm', fmtN(totalEstqMcm));
    setKpi('kpi-criticos', fmtN(totalCriticos));
    setKpi('kpi-atencao',  fmtN(totalAtencao));
    setKpi('kpi-transfer', fmtN(totalTransfer));

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr class="loading-row"><td colspan="12">Nenhum resultado para os filtros aplicados.</td></tr>';
        return;
    }

    // ── Agrupar por categoria simplificada ──
    const grupos = {};
    CATEGORIA_ORDER.forEach(g => grupos[g] = []);

    filtered.forEach(row => {
        const grp = mapCategoria(row.CATEGORIA);
        if (!grupos[grp]) grupos[grp] = [];
        grupos[grp].push(row);
    });

    // ── Montar HTML com seções ──
    const html = [];

    CATEGORIA_ORDER.forEach(catNome => {
        let items = grupos[catNome];
        if (!items || items.length === 0) return;
        
        if (currentSort.col) {
            items = items.slice().sort((a, b) => compareRows(a, b, currentSort.col, currentSort.dir));
        }

        const cor   = CATEGORIA_COLOR[catNome] || '#f5c518';
        const icon  = CATEGORIA_ICON[catNome]  || '📦';
        const key   = catNome.replace(/\s+/g, '_');

        // Subtotais da categoria
        let subEmp = 0, subMcm = 0, subMa = 0, subM1 = 0, subM2 = 0, subM3 = 0, subTT = 0;
        let subCrit = 0, subWarn = 0;
        items.forEach(r => {
            subEmp += Number(r.SALDO_EMPRESA)  || 0;
            subMcm += Number(r.SALDO_MCM)      || 0;
            subMa  += Number(r.QTD_VENDAS_MES) || 0;
            subM1  += Number(r.QTD_M1)         || 0;
            subM2  += Number(r.QTD_M2)         || 0;
            subM3  += Number(r.QTD_M3)         || 0;
            subTT  += Number(r.TT_TRANSFERIR)   || 0;
            const d = Number(r.DIAS_COBERTURA);
            if (d <= 10 && d !== 9999) subCrit++;
            else if (d <= 30 && d !== 9999) subWarn++;
        });

        // Manter estado de abertura entre re-renders
        if (secaoAberta[key] === undefined) secaoAberta[key] = true;
        const aberta = secaoAberta[key];

        const alertBadge = subCrit > 0
            ? `<span style="background:#b71c1c;color:#ef9a9a;padding:1px 7px;border-radius:10px;font-size:9px;margin-left:6px">⚠ ${subCrit} crítico${subCrit > 1 ? 's' : ''}</span>`
            : (subWarn > 0 ? `<span style="background:#e65100;color:#ffcc80;padding:1px 7px;border-radius:10px;font-size:9px;margin-left:6px">${subWarn} atenção</span>` : '');

        // Linha de cabeçalho da categoria
        html.push(`<tr class="cat-header" onclick="toggleSecao('${key}')" style="cursor:pointer; background:#0e1118; border-top:2px solid ${cor}40; border-bottom:1px solid ${cor}30;">
            <td colspan="2" style="padding:8px 10px; color:${cor}; font-weight:800; font-size:11px; letter-spacing:.5px;">
                <span style="font-size:14px;margin-right:6px">${icon}</span>
                ${catNome.toUpperCase()}
                ${alertBadge}
                <span id="arrow-${key}" style="margin-left:8px;font-size:10px;color:#64748b">${aberta ? '▲' : '▼'}</span>
            </td>
            <td class="num" style="color:${cor};font-weight:700;font-size:10px">${fmtN(subMa)}</td>
            <td class="num" style="color:#94a3b8;font-size:10px">${fmtN(subM1)}</td>
            <td class="num" style="color:#94a3b8;font-size:10px">${fmtN(subM2)}</td>
            <td class="num" style="color:#94a3b8;font-size:10px">${fmtN(subM3)}</td>
            <td></td>
            <td class="num" style="color:#66bb6a;font-weight:700;font-size:10px">${fmtN(subEmp)}</td>
            <td class="center" style="font-size:9px;color:#64748b">${items.length} prod.</td>
            <td class="num" style="color:#a5d6a7;font-size:10px">${fmtN(subMcm)}</td>
            <td></td>
            <td class="center" style="color:#90caf9;font-size:10px">${subTT > 0 ? fmtN(subTT) + ' sug.' : '—'}</td>
        </tr>`);

        // Linhas de produto (colapsáveis)
        if (aberta) {
            items.forEach(row => {
                html.push(buildProductRow(row));
            });
        }
    });

    tbody.innerHTML = html.join('');
}

// ── Colapsar/expandir seção ────────────────────────────────────
function toggleSecao(key) {
    secaoAberta[key] = !secaoAberta[key];
    renderTable(estoqueData);
}

function filterTable() {
    renderTable(estoqueData);
}

// ── Fetch ──────────────────────────────────────────────────────
async function fetchData() {
    const btn   = document.getElementById('btn-refresh');
    const tbody = document.getElementById('tbl-body');
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
    if (tbody && estoqueData.length === 0) {
        tbody.innerHTML = '<tr class="loading-row"><td colspan="12"><span class="spinner"></span> Carregando dados do banco...</td></tr>';
    }

    try {
        const res  = await fetch('/api/estoque_previsao');
        const json = await res.json();

        if (json.success) {
            if (json.meta) metaLabels = json.meta;
            updateHeaderLabels();

            const isFirst = estoqueData.length === 0;
            estoqueData = json.data || [];

            if (isFirst) buildAllDropdowns(estoqueData);
            setTimeout(() => renderTable(estoqueData), 0);
        } else {
            console.error('API error:', json.error);
            if (tbody) tbody.innerHTML = `<tr class="loading-row"><td colspan="12" style="color:#ef9a9a">Erro: ${json.error}</td></tr>`;
        }
    } catch (err) {
        console.error('Fetch error:', err);
        if (tbody) tbody.innerHTML = `<tr class="loading-row"><td colspan="12" style="color:#ef9a9a">Erro de rede.</td></tr>`;
    } finally {
        if (btn) btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
    }
}

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setInterval(fetchData, 15 * 60 * 1000);
});
