let nextUpdateSeconds = 600;
let currentMetric = 'completo'; // 'completo', 'share', 'mom', 'yoy'
let currentData = null;
let currentSort = { column: 'rank', asc: true };
const nomesMeses = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Country flag emojis / icons map for visual elegance
const countryIcons = {
    'BRASIL': '🇧🇷',
    'MEXICO': '🇲🇽',
    'MÉXICO': '🇲🇽',
    'VENEZUELA': '🇻🇪',
    'COLOMBIA': '🇨🇴',
    'COLÔMBIA': '🇨🇴',
    'ARGENTINA': '🇦🇷',
    'PERU': '🇵🇪',
    'PORTUGAL': '🇵🇹',
    'ESPANHA': '🇪🇸',
    'EQUADOR': '🇪🇨',
    'ESTADOS UNIDOS': '🇺🇸',
    'BOLIVIA': '🇧🇴',
    'BOLÍVIA': '🇧🇴',
    'CHILE': '🇨🇱',
    'URUGUAY': '🇺🇾',
    'URUGUAI': '🇺🇾',
    'EL SALVADOR': '🇸🇻',
    'ARGELIA': '🇩🇿',
    'ARGÉLIA': '🇩🇿',
    'GEORGIA': '🇬🇪',
    'GEÓRGIA': '🇬🇪',
    'ITALIA': '🇮🇹',
    'ITÁLIA': '🇮🇹',
    'FRANCE': '🇫🇷',
    'FRANÇA': '🇫🇷',
    'POLONIA': '🇵🇱',
    'POLÔNIA': '🇵🇱',
    'GUATEMALA': '🇬🇹',
    'PANAMA': '🇵🇦',
    'PANAMÁ': '🇵🇦',
    'COSTA RICA': '🇨🇷',
    'ARABIA SAUDITA': '🇸🇦',
    'ARÁBIA SAUDITA': '🇸🇦',
    'IRAQUE': '🇮🇶',
    'CHINA': '🇨🇳',
    'LIBANO': '🇱🇧',
    'LÍBANO': '🇱🇧',
    'AZERBAIJAN': '🇦🇿',
    'AZERBAIJÃO': '🇦🇿',
    'CANADA': '🇨🇦',
    'CANADÁ': '🇨🇦',
    'ISRAEL': '🇮🇱',
    'BELGICA': '🇧🇪',
    'BÉLGICA': '🇧🇪',
    'HOLANDA': '🇳🇱',
    'AFRICA DO SUL': '🇿🇦',
    'ÁFRICA DO SUL': '🇿🇦',
    'PUERTO RICO': '🇵🇷',
    'INDIA': '🇮🇳',
    'ÍNDIA': '🇮🇳',
    'EMIRADOS ARABES UNIDOS': '🇦🇪',
    'EMIRADOS ÁRABES UNIDOS': '🇦🇪',
    'TURQUIA': '🇹🇷',
    'QATAR': '🇶🇦'
};

function getCountryFlag(name) {
    if (!name) return '🌐';
    const clean = name.trim().toUpperCase();
    return countryIcons[clean] || '🌐';
}

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

    // Mes de corte: da URL, senao o mes corrente. A tabela consolida
    // 01/01 ate o fim desse mes (ou ate hoje, se for o mes corrente).
    const mesParam = urlParams.get('mes');
    let mesCorte = parseInt(String(mesParam || '').split(',').pop());
    if (isNaN(mesCorte) || mesCorte < 1 || mesCorte > 12) {
        mesCorte = now.getMonth() + 1;
    }
    const monthEl = document.getElementById('filter-month');
    if (monthEl) monthEl.value = String(mesCorte);
}








document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('month-multiselect');
    if (wrapper && wrapper.classList.contains('open')) {
        if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
        }
    }
});

// ---------------------------------------------------------------------------
// O multiselect de meses foi substituido por um seletor unico de mes de corte:
// a tabela consolida 01/01 ate a data de corte, entao um intervalo de meses nao
// delimitava mais nada. As funcoes abaixo ficam como no-op para nao quebrar
// handlers remanescentes.
// ---------------------------------------------------------------------------
function initMonthMultiselect() {}
function toggleMonthDropdown(event) { if (event) event.stopPropagation(); }
function onMonthCheckChange() {}
function selectAllMonths(all, event) { if (event) event.stopPropagation(); }
function selectLastNMonths(n, event) { if (event) event.stopPropagation(); }
function syncCheckboxUI() {}
function updateMonthSelectLabel() {}

function formatMoeda(val) {
    if (val === null || val === undefined || isNaN(val)) return 'R$ 0,00';
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPct(val) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    const sinal = val > 0 ? '+' : '';
    return `${sinal}${Number(val).toFixed(1)}%`;
}

function formatShare(val) {
    if (val === null || val === undefined || isNaN(val) || val === 0) return '—';
    const num = Number(val);
    if (Math.abs(num) < 1 && Math.abs(num) > 0) {
        return `${num.toFixed(2)}%`;
    }
    return `${num.toFixed(1)}%`;
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
    if (rank === 1) return `<span class="rank-badge top-1 rank-1">1º</span>`;
    if (rank === 2) return `<span class="rank-badge top-2 rank-2">2º</span>`;
    if (rank === 3) return `<span class="rank-badge top-3 rank-3">3º</span>`;
    return `<span class="rank-badge standard rank-other">${rank}º</span>`;
}

function renderStatusTag(status) {
    const s = (status || 'Estável').toLowerCase();
    let cls = 'estavel';
    let tooltip = 'Estável: Variação de ranking e faturamento (MoM) sem oscilações drásticas.';

    if (s.includes('líder') || s.includes('lider')) {
        cls = 'lider';
        tooltip = 'Líder: O país está no Top 2 em faturamento líquido.';
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

// ---------------------------------------------------------------------------
// Tabela CONSOLIDADA: acumulado de 01/01 ate a data de corte, com as mesmas
// tres medidas da guia Mensal (MoM, YoY, YTD). Substituiu a visao mes a mes.
// Todos os percentuais vem prontos do backend, ja com periodos equivalentes.
// ---------------------------------------------------------------------------

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

    const itemLabel = 'País';
    const ano = currentData.ano;
    const per = rotuloPeriodo();

    theadRow.innerHTML = `
        <th class="col-rank sortable text-center" onclick="sortTable('rank')"># ↕</th>
        <th class="col-item sortable text-left" onclick="sortTable('item')" style="min-width: 200px; max-width: 280px;">${itemLabel} ↕</th>
        <th class="sortable text-right" onclick="sortTable('faturamento')" style="border-left: 1px solid #475569; white-space: nowrap;" title="Receita projetada acumulada de ${per} de ${ano}">Acum. ${ano} ↕</th>
        <th class="sortable text-right" onclick="sortTable('faturamento_ant')" style="white-space: nowrap;" title="Mesmo período de ${ano - 1}, cortado no mesmo dia">Acum. ${ano - 1} ↕</th>
        <th class="col-share-periodo sortable text-right" onclick="sortTable('share')" title="Participação no acumulado do ano">Share ↕</th>
        <th class="col-share-ant sortable text-right" onclick="sortTable('share_ant')" title="Participação no mesmo período do ano anterior">Share A-1 ↕</th>
        <th class="col-share-var sortable text-right" onclick="sortTable('share_var')" title="Variação em pontos percentuais entre o Share atual e o do ano anterior">Δ Share ↕</th>
        <th class="col-mes-mom sortable text-center" onclick="sortTable('mom')" style="border-left: 1px solid #475569; white-space: nowrap;" title="MoM: mês corrente contra o mês anterior, no mesmo intervalo de dias">MoM ↕</th>
        <th class="col-mes-yoy sortable text-center" onclick="sortTable('yoy')" style="white-space: nowrap;" title="YoY: mês corrente contra o mesmo mês do ano anterior, no mesmo intervalo de dias">YoY ↕</th>
        <th class="col-ytd-yoy sortable text-center" onclick="sortTable('ytd_yoy')" style="background: rgba(255,193,7,0.1); color: var(--gold-light); white-space: nowrap;" title="YTD: acumulado de ${per} contra o mesmo período do ano anterior">YTD ↕</th>
        <th class="col-status text-center" style="min-width: 90px; white-space: nowrap;">Status</th>
    `;
}

// Base irrisoria no periodo anterior gera percentual sem significado
// (ex.: R$ 403 -> R$ 366 mil = +90.674%). Acima do piso mostra o selo "novo",
// com os valores reais no tooltip.
const BASE_MINIMA_COMPARAVEL = 5000;

function pilulaVariacao(valor, base) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) {
        return '<span class="cell-vazio">—</span>';
    }
    if (base !== undefined && base !== null && Math.abs(base) < BASE_MINIMA_COMPARAVEL) {
        return `<span class="delta-badge new" style="font-size:0.72rem; padding:2px 5px;">★ novo</span>`;
    }
    const cls = valor > 0 ? 'positive' : (valor < 0 ? 'negative' : 'neutral');
    return `<span class="pct-pill ${cls}" style="display:inline-block; margin:0; font-size:0.78rem; padding:2px 5px;">${formatPct(valor)}</span>`;
}

function renderTable() {
    if (!currentData) return;

    renderTableHeader();

    const items = [...(currentData.paises || [])];
    const searchTerm = (document.getElementById('table-search')?.value || '').toLowerCase().trim();
    const ano = currentData.ano;

    const filtered = items.filter(it => it.item.toLowerCase().includes(searchTerm));

    filtered.sort((a, b) => {
        let valA = a[currentSort.column];
        let valB = b[currentSort.column];
        // Sem base de comparação vai para o fim da lista, nunca para o topo.
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

    tbody.innerHTML = filtered.map(row => {
        const diffPp = row.share_var ?? 0;
        const diffSign = diffPp > 0 ? '+' : '';
        const diffArrow = diffPp > 0 ? '▲' : (diffPp < 0 ? '▼' : '—');
        const diffCls = diffPp > 0 ? 'up' : (diffPp < 0 ? 'down negative' : 'equal');

        const tipMoM = `Mês corrente: ${formatMoeda(row.mtd)} · mês anterior (mesmo intervalo): ${formatMoeda(row.mes_anterior)}`;
        const tipYoY = `Mês corrente: ${formatMoeda(row.mtd)} · mesmo mês de ${ano - 1}: ${formatMoeda(row.mes_ano_anterior)}`;
        const tipYTD = `${per}: ${formatMoeda(row.faturamento)} · mesmo período de ${ano - 1}: ${formatMoeda(row.faturamento_ant)}`;

        return `
            <tr>
                <td class="col-rank text-center">${renderRankBadge(row.rank)}</td>
                <td class="col-item text-left" title="${row.item}" style="min-width:200px; max-width:280px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${row.item}</td>
                <td class="text-right" style="border-left:1px solid #475569; white-space:nowrap;" title="${per} de ${ano}">${formatMoeda(row.faturamento)}</td>
                <td class="text-right" style="white-space:nowrap; color:#9aa3b2;" title="Mesmo período de ${ano - 1}">${formatMoeda(row.faturamento_ant)}</td>
                <td class="col-share-periodo text-right"><span class="share-periodo-val">${row.share.toFixed(1)}%</span></td>
                <td class="col-share-ant text-right"><span class="share-ant-val">${row.share_ant.toFixed(1)}%</span></td>
                <td class="col-share-var text-right"><span class="var-share-pill ${diffCls}">${diffArrow} ${diffSign}${diffPp.toFixed(1)}%</span></td>
                <td class="col-mes-mom text-center" style="border-left:1px solid #475569;" title="${tipMoM}">${pilulaVariacao(row.mom, row.mes_anterior)}</td>
                <td class="col-mes-yoy text-center" title="${tipYoY}">${pilulaVariacao(row.yoy, row.mes_ano_anterior)}</td>
                <td class="col-ytd-yoy text-center" style="background: rgba(255,193,7,0.05);" title="${tipYTD}">${pilulaVariacao(row.ytd_yoy, row.faturamento_ant)}</td>
                <td class="col-status text-center" style="min-width:90px; white-space:nowrap;">${renderStatusTag(row.status)}</td>
            </tr>
        `;
    }).join('');

    const totalItensEl = document.getElementById('total-itens');
    const totalFatEl = document.getElementById('total-faturamento');
    if (totalItensEl) totalItensEl.innerText = filtered.length;
    if (totalFatEl) totalFatEl.innerText = `${formatMoeda(currentData.total_faturamento)} [${per}]`;
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
    const refreshParam = forceRefresh ? `&refresh=1&_t=${Date.now()}` : '';

    try {
        const res = await fetch(`/api/paises_dados?mes=${refMes}&ano=${ano}${refreshParam}`);
        const json = await res.json();

        if (json.success && json.data) {
            currentData = json.data;
            renderTable();

            const lastEl = document.getElementById('last-update');
            if (lastEl) lastEl.innerText = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
        } else {
            console.error("Erro na API paises_dados:", json.error);
        }
    } catch (err) {
        console.error("Falha ao buscar dados de países:", err);
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
