/* ════════════════════════════════════════════════════════════════
   estoque.js  —  Análise de Demanda e Reabastecimento
   Dashboard TV · MQ Hair
   ════════════════════════════════════════════════════════════════ */

'use strict';

let estoqueData  = [];
let metaLabels   = { label_ma: 'Mês Atual', label_m1: 'M-1', label_m2: 'M-2', label_m3: 'M-3' };

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

// ── Dropdown genérico ──────────────────────────────────────────
function toggleDrop(type) {
    const menu = document.getElementById('menu-' + type);
    if (!menu) return;
    const isOpen = menu.style.display === 'block';
    // fechar todos
    ['empresa', 'marca', 'categoria', 'sintetico'].forEach(t => {
        const m = document.getElementById('menu-' + t);
        if (m) m.style.display = 'none';
    });
    if (!isOpen) menu.style.display = 'block';
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
    const all    = container.querySelectorAll('input[type="checkbox"]');
    const checked = Array.from(all).filter(c => c.checked);
    const labels = {
        empresa:   'Todas Empresas',
        marca:     'Todas Marcas',
        categoria: 'Todos Grupos',
        sintetico: 'Todos Sintéticos'
    };
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

// Fechar menus ao clicar fora
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
    const container  = document.getElementById('opts-' + type);
    const allCb      = document.getElementById('all-' + type);
    if (!container) return;

    const prev = getSelected(type);
    const hadPrev = prev.length > 0;

    const vals = [...new Set(data.map(r => r[field] || 'SEM GRUPO'))].filter(Boolean).sort();
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
    buildDropdown('empresa',   data, 'NOME_EMPRESA');
    buildDropdown('marca',     data, 'MARCA');
    buildDropdown('categoria', data, 'CATEGORIA');
    buildDropdown('sintetico', data, 'GRUPO_SINTETICO');
}

// ── Actualizar cabeçalhos com labels dinâmicos ─────────────────
function updateHeaderLabels() {
    const th_ma = document.getElementById('th-ma');
    const th_m1 = document.getElementById('th-m1');
    const th_m2 = document.getElementById('th-m2');
    const th_m3 = document.getElementById('th-m3');
    if (th_ma) th_ma.innerHTML = `VENDA <span class="th-sub">${metaLabels.label_ma}</span>`;
    if (th_m1) th_m1.innerHTML = `VENDA <span class="th-sub">${metaLabels.label_m1}</span>`;
    if (th_m2) th_m2.innerHTML = `VENDA <span class="th-sub">${metaLabels.label_m2}</span>`;
    if (th_m3) th_m3.innerHTML = `VENDA <span class="th-sub">${metaLabels.label_m3}</span>`;
}

// ── Renderizar tabela ──────────────────────────────────────────
function renderTable(data) {
    const tbody     = document.getElementById('tbl-body');
    if (!tbody) return;

    const search    = (document.getElementById('search-input')?.value || '').toLowerCase();
    const selEmp    = getSelected('empresa');
    const selMarca  = getSelected('marca');
    const selCat    = getSelected('categoria');
    const selSint   = getSelected('sintetico');

    const filtered = data.filter(row => {
        const empresa   = row.NOME_EMPRESA || '';
        const marca     = row.MARCA        || '';
        const cat       = row.CATEGORIA    || 'SEM GRUPO';
        const sint      = row.GRUPO_SINTETICO || 'SEM GRUPO';
        const codprod   = String(row.CODPROD || '');
        const produto   = row.NOME_PRODUTO || '';

        const matchEmp  = selEmp.length  === 0 || selEmp.includes(empresa);
        const matchMrk  = selMarca.length === 0 || selMarca.includes(marca);
        const matchCat  = selCat.length  === 0 || selCat.includes(cat);
        const matchSint = selSint.length === 0 || selSint.includes(sint);
        const matchTxt  = !search || codprod.includes(search) || produto.toLowerCase().includes(search) || marca.toLowerCase().includes(search);

        return matchEmp && matchMrk && matchCat && matchSint && matchTxt;
    });

    // ── KPIs ──
    let totalEstqEmp  = 0;
    let totalEstqMcm  = 0;
    let totalCriticos = 0;
    let totalAtencao  = 0;
    let totalTransfer = 0;

    filtered.forEach(r => {
        totalEstqEmp  += Number(r.SALDO_EMPRESA)  || 0;
        totalEstqMcm  += Number(r.SALDO_MCM)      || 0;
        totalTransfer += Number(r.TT_TRANSFERIR)   || 0;
        const dias = Number(r.DIAS_COBERTURA);
        if (dias <= 10 && dias !== 9999)  totalCriticos++;
        else if (dias <= 30 && dias !== 9999) totalAtencao++;
    });

    const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setKpi('kpi-total',    fmtN(filtered.length));
    setKpi('kpi-estq-emp', fmtN(totalEstqEmp));
    setKpi('kpi-estq-mcm', fmtN(totalEstqMcm));
    setKpi('kpi-criticos', fmtN(totalCriticos));
    setKpi('kpi-atencao',  fmtN(totalAtencao));
    setKpi('kpi-transfer', fmtN(totalTransfer));

    // ── Linhas ──
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr class="loading-row"><td colspan="12">Nenhum resultado para os filtros aplicados.</td></tr>';
        return;
    }

    const rows = filtered.map(row => {
        const dias = Number(row.DIAS_COBERTURA);
        const saldoEmp = Number(row.SALDO_EMPRESA) || 0;
        const saldoMcm = Number(row.SALDO_MCM)     || 0;
        const tt       = Number(row.TT_TRANSFERIR)  || 0;

        // Badge dias
        let badgeClass, badgeText, trClass = '';
        if (dias === 9999 || Number(row.VENDA_MEDIA_DIARIA) === 0) {
            badgeClass = 'badge-gray'; badgeText = 'S/ Venda';
        } else if (dias <= 10) {
            badgeClass = 'badge-critic'; badgeText = `⚠ ${dias}d`; trClass = 'critical';
        } else if (dias <= 30) {
            badgeClass = 'badge-warn';   badgeText = `${dias}d`;   trClass = 'warning';
        } else {
            badgeClass = 'badge-ok';     badgeText = `${dias}d`;
        }

        // Badge transferência
        const ttBadge = tt > 0
            ? `<span class="badge-dias badge-transfer">${fmtN(tt)}</span>`
            : '<span style="color:#374151">—</span>';

        return `<tr class="${trClass}">
            <td class="num prod-code">${row.CODPROD || ''}</td>
            <td class="td-left">
                <div class="prod-name">${row.NOME_PRODUTO || '—'}</div>
                <div class="prod-tag">${row.MARCA || ''} · ${row.CATEGORIA || ''} · ${row.GRUPO_SINTETICO || ''}</div>
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
    });

    tbody.innerHTML = rows.join('');
}

function filterTable() {
    renderTable(estoqueData);
}

// ── Fetch ──────────────────────────────────────────────────────
async function fetchData() {
    const btn = document.getElementById('btn-refresh');
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';

    const tbody = document.getElementById('tbl-body');
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
            renderTable(estoqueData);
        } else {
            console.error('API error:', json.error);
            if (tbody) tbody.innerHTML = `<tr class="loading-row"><td colspan="12" style="color:#ef9a9a">Erro ao carregar dados: ${json.error}</td></tr>`;
        }
    } catch (err) {
        console.error('Fetch error:', err);
        if (tbody) tbody.innerHTML = `<tr class="loading-row"><td colspan="12" style="color:#ef9a9a">Erro de rede. Tente novamente.</td></tr>`;
    } finally {
        if (btn) btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
    }
}

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    // Atualizar a cada 15 minutos
    setInterval(fetchData, 15 * 60 * 1000);
});
