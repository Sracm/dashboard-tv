let nextUpdateSeconds = 600;
let currentView = 'categoria'; // 'categoria' ou 'marca'
let currentMetric = 'completo'; // 'completo', 'share', 'mom', 'yoy'
let currentData = null;
let currentSort = { column: 'rank', asc: true };
const nomesMeses = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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
    const mes = document.getElementById('filter-month')?.value || 9;
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
        return `<span class="delta-badge new">✨ NOVO</span>`;
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
        tooltip = 'Atenção: Queda ≤ -15% (MoM) OU caiu 2+ posições no ranking.';
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

function rotuloPeriodo() {
    const c = currentData && currentData.contexto;
    if (!c) return '';
    const fim = c.periodos.ytd[1];
    const partes = fim.split('-');
    return `01/01 a ${partes[2]}/${partes[1]}${c.parcial ? ` (${c.dias} dias)` : ''}`;
}

function renderTableHeader() {
    const theadRow = document.getElementById('table-header-row');
    if (!theadRow || !currentData) return;

    const itemLabel = currentView === 'categoria' ? 'Categoria Analítica' : 'Marca';
    const ano = currentData.ano;
    const per = rotuloPeriodo();

    theadRow.innerHTML = `
        <th class="col-rank sortable text-center" onclick="sortTable('rank')">Posição ⇅</th>
        <th class="col-item sortable text-left" onclick="sortTable('item')" style="min-width: 200px; max-width: 280px;">Produto ⇅</th>
        <th class="sortable text-right" onclick="sortTable('faturamento')" style="border-left: 1px solid #475569; white-space: nowrap; display: none;" title="Receita acumulada de ${per} de ${ano}">Acum. ${ano} ⇅</th>
        <th class="sortable text-right" onclick="sortTable('faturamento_ant')" style="white-space: nowrap; display: none;" title="Mesmo período de ${ano - 1}, cortado no mesmo dia">Acum. ${ano - 1} ⇅</th>
        <th class="col-share-ant sortable text-center" onclick="sortTable('share_ant')" title="Participação no mesmo período do ano anterior">Part. % Anter. ⇅</th>
        <th class="col-share-periodo sortable text-center" onclick="sortTable('share')" title="Participação no canal">Part. % Atual ⇅</th>
        <th class="col-share-var sortable text-center" onclick="sortTable('share_var')" title="Variação em pontos percentuais (Share atual - anterior)">Var. pp ⇅</th>
        <th class="col-mes-mom sortable text-center" onclick="sortTable('mom')" style="border-left: 1px solid #475569; white-space: nowrap;" title="MoM: mês corrente contra o mês anterior, no mesmo intervalo de dias">% Cresc. (MoM) ⇅</th>
        <th class="col-mes-yoy sortable text-center" onclick="sortTable('yoy')" style="white-space: nowrap;" title="YoY: mês corrente contra o mesmo mês do ano anterior, no mesmo intervalo de dias">% Cresc. (YoY) ⇅</th>
        <th class="col-ytd-yoy sortable text-center" onclick="sortTable('ytd_yoy')" style="background: rgba(255,193,7,0.1); color: var(--gold-light); white-space: nowrap;" title="YTD: acumulado de ${per} contra o mesmo período do ano anterior">% Cresc. (YTD) ⇅</th>
        <th class="col-status text-center" style="min-width: 90px; white-space: nowrap;">Classificação</th>
    `;
}

const BASE_MINIMA_COMPARAVEL = 5000;

function pilulaVariacao(valor, base) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) {
        return '<span class="cell-vazio">—</span>';
    }
    if (base !== undefined && base !== null && Math.abs(base) < BASE_MINIMA_COMPARAVEL) {
        return `<span class="delta-badge new" style="font-size:0.72rem; padding:2px 5px;">✨ novo</span>`;
    }
    const cls = valor > 0 ? 'positive' : (valor < 0 ? 'negative' : 'neutral');
    return `<span class="pct-pill ${cls}" style="display:inline-block; margin:0; font-size:0.78rem; padding:2px 5px;">${formatPct(valor)}</span>`;
}

function renderTable() {
    if (!currentData) return;

    renderTableHeader();

    const items = currentView === 'categoria' ? [...(currentData.categorias || [])] : [...(currentData.marcas || [])];
    const searchTerm = (document.getElementById('table-search')?.value || '').toLowerCase().trim();
    const ano = currentData.ano;

    // Filter by item or children item
    const filtered = items.filter(it => {
        if (it.item.toLowerCase().includes(searchTerm)) return true;
        if (it.produtos) {
            return it.produtos.some(p => p.item.toLowerCase().includes(searchTerm));
        }
        return false;
    });

    // Sorting only on parent for now, children are already sorted by backend (or can be sorted here)
    filtered.sort((a, b) => {
        let valA = a[currentSort.column];
        let valB = b[currentSort.column];
        if (valA === null || valA === undefined) valA = currentSort.asc ? Infinity : -Infinity;
        if (valB === null || valB === undefined) valB = currentSort.asc ? Infinity : -Infinity;
        if (typeof valA === 'string') {
            return currentSort.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return currentSort.asc ? valA - valB : valB - valA;
    });

    const tbody = document.getElementById('table-body');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px; color:#8c93a0;">Nenhum registro encontrado.</td></tr>`;
        return;
    }

    const per = rotuloPeriodo();

    let html = '';
    
    filtered.forEach(row => {
        const diffPp = row.var_pp ?? (row.share - (row.share_ant || 0)) ?? 0;
        const diffSign = diffPp > 0 ? '+' : '';
        const diffCls = diffPp > 0 ? 'up' : (diffPp < 0 ? 'down negative' : 'equal');

        // Parent Row (Categoria/Marca)
        html += `
            <tr style="background-color: rgba(255,255,255,0.02); font-weight: bold; border-top: 2px solid #334155;">
                <td class="col-rank text-center"></td>
                <td class="col-item text-center" title="${row.item}" style="min-width:200px; max-width:280px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${row.item}</td>
                <td class="text-right" style="border-left:1px solid #475569; white-space:nowrap; display: none;" title="${per} de ${ano}">${formatMoeda(row.faturamento)}</td>
                <td class="text-right" style="white-space:nowrap; color:#9aa3b2; display: none;" title="Mesmo período de ${ano - 1}">${formatMoeda(row.faturamento_ant)}</td>
                <td class="col-share-ant text-center"><span class="share-ant-val">${(row.share_ant ?? 0).toFixed(1)}%</span></td>
                <td class="col-share-periodo text-center"><span class="share-periodo-val">${(row.share ?? 0).toFixed(1)}%</span></td>
                <td class="col-share-var text-center"><span class="var-share-pill ${diffCls}">${diffSign}${diffPp.toFixed(1)}%</span></td>
                <td class="col-mes-mom text-center" style="border-left:1px solid #475569;">${pilulaVariacao(row.mom, row.mes_anterior)}</td>
                <td class="col-mes-yoy text-center">${pilulaVariacao(row.yoy, row.mes_ano_anterior)}</td>
                <td class="col-ytd-yoy text-center" style="background: rgba(255,193,7,0.05);">${pilulaVariacao(row.ytd_yoy, row.faturamento_ant)}</td>
                <td class="col-status text-center"></td>
            </tr>
        `;
        
        // Children Rows (Produtos)
        if (row.produtos && row.produtos.length > 0) {
            row.produtos.forEach(f => {
                // If filtering by search term, and search term exists, and product doesn't match, skip
                if (searchTerm && !f.item.toLowerCase().includes(searchTerm) && !row.item.toLowerCase().includes(searchTerm)) {
                    return;
                }
                
                const fdiffPp = f.var_pp ?? (f.share - (f.share_ant || 0)) ?? 0;
                const fdiffSign = fdiffPp > 0 ? '+' : '';
                const fdiffCls = fdiffPp > 0 ? 'up' : (fdiffPp < 0 ? 'down negative' : 'equal');

                html += `
                    <tr>
                        <td class="col-rank text-center">${f.rank ? f.rank : '-'}</td>
                        <td class="col-item text-left" style="padding-left: 20px; font-size: 0.9em; min-width:200px; max-width:280px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${f.item}">${f.item}</td>
                        <td class="text-right" style="border-left:1px solid #475569; white-space:nowrap; display: none;">${formatMoeda(f.faturamento)}</td>
                        <td class="text-right" style="white-space:nowrap; color:#9aa3b2; display: none;">${formatMoeda(f.faturamento_ant)}</td>
                        <td class="col-share-ant text-center"><span class="share-ant-val" style="font-size: 0.9em; color:#9aa3b2;">${(f.share_ant ?? 0).toFixed(1)}%</span></td>
                        <td class="col-share-periodo text-center"><span class="share-periodo-val" style="font-size: 0.9em;">${(f.share ?? 0).toFixed(1)}%</span></td>
                        <td class="col-share-var text-center"><span class="var-share-pill ${fdiffCls}" style="font-size: 0.85em;">${fdiffSign}${fdiffPp.toFixed(1)}%</span></td>
                        <td class="col-mes-mom text-center" style="border-left:1px solid #475569;">${pilulaVariacao(f.mom, f.faturamento_mtd)}</td>
                        <td class="col-mes-yoy text-center">${pilulaVariacao(f.yoy, f.faturamento_mtd)}</td>
                        <td class="col-ytd-yoy text-center" style="background: rgba(255,193,7,0.05);">${pilulaVariacao(f.ytd_yoy, f.faturamento_ant)}</td>
                        <td class="col-status text-center" style="min-width:90px; white-space:nowrap;">${renderStatusTag(f.status)}</td>
                    </tr>
                `;
            });
        }
    });

    tbody.innerHTML = html;
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
    const canal = window.CURRENT_CANAL || '';

    try {
        let url = `/api/canal_dados?canal=${encodeURIComponent(canal)}&mes=${refMes}&ano=${ano}`;
        if (forceRefresh) {
            url += `&refresh=1&_t=${Date.now()}`;
        }
        const res = await fetch(url);
        const json = await res.json();

        if (json.success && json.data) {
            currentData = json.data;
            renderTable();

            const lastEl = document.getElementById('last-update');
            if (lastEl) lastEl.innerText = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
        } else {
            console.error("Erro na API canal_dados:", json.error);
        }
    } catch (err) {
        console.error("Falha ao buscar dados do canal:", err);
    }
}

function manualRefresh() {
    nextUpdateSeconds = 600;
    fetchData(true);
}

document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    updateClock();
    setInterval(updateClock, 1000);
    fetchData();
});
