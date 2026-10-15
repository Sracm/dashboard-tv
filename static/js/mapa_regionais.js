/**
 * ============================================================================
 * MQ HAIR COMPANY — MAPA BRASIL ACUMULADO YTD (PAINEL TV)
 * ============================================================================
 * - 100% Métricas em Percentual (Share %) e Variação em Pontos Percentuais (p.p.)
 * - Zero valores em R$.
 * - Hierarquia: Estado ➔ Categoria ➔ Produto com Comparativo YoY e Status MAIOR/MENOR
 * - Mapa do Brasil Ampliado com Labels de Share por Estado
 * - Rankings de Categorias e Produtos
 */

let myChart = null;
let currentData = null;
let activeRegionFilter = 'TODAS';
let selectedUf = 'SP';
let autoRotateTimer = null;
let isAutoRotateActive = true;
let nextRefreshSeconds = 600;
let expandedUfs = new Set(['SP']);
let expandedCats = new Set(['SP_Pranchas']);

let isGeoJsonLoaded = false;

// ── Inicialização ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Sincroniza selects com parâmetros da URL caso tenham sido informados
    const urlParams = new URLSearchParams(window.location.search);
    const mesParam = urlParams.get('mes');
    const anoParam = urlParams.get('ano');
    const monthEl = document.getElementById('filter-month');
    const yearEl = document.getElementById('filter-year');

    // Sanitização segura do mês (aceita "9" ou "1,2,3,4,5,6,7,8,9" pegando o último mês da lista)
    let cleanMes = 9;
    if (mesParam) {
        const parts = String(mesParam).split(',').map(s => s.trim()).filter(Boolean);
        const lastPart = parts[parts.length - 1];
        const num = parseInt(lastPart, 10);
        if (!isNaN(num) && num >= 1 && num <= 12) {
            cleanMes = num;
        }
    }
    if (monthEl) {
        monthEl.value = String(cleanMes);
    }
    if (anoParam && yearEl) {
        const numAno = parseInt(anoParam, 10);
        if (!isNaN(numAno) && numAno >= 2020) {
            yearEl.value = String(numAno);
        }
    }

    initClock();
    initChart();
    
    // Carregamento concorrente do GeoJSON e dos Dados da API
    await Promise.allSettled([
        carregarGeoJson(),
        carregarDadosApi()
    ]);

    // Sincroniza aba inicial caso informada na URL pelo TV Rotator (?tab=rankings / ?tab=hierarquia)
    const tabParam = urlParams.get('tab');
    if (tabParam === 'rankings') {
        trocarPainelDetalhe('rankings');
    } else {
        trocarPainelDetalhe('hierarquia');
    }

    iniciarAutoRotacao();
    iniciarAlternanciaAbasTV();
});

// ── Relógio e Contadores da TV ────────────────────────────────────────────────
function initClock() {
    function update() {
        const now = new Date();
        const clockEl = document.getElementById('clock');
        const dateEl = document.getElementById('date');
        if (clockEl) clockEl.innerText = now.toLocaleTimeString('pt-BR');
        if (dateEl) dateEl.innerText = now.toLocaleDateString('pt-BR');

        nextRefreshSeconds--;
        if (nextRefreshSeconds <= 0) {
            nextRefreshSeconds = 600;
            carregarDadosApi(true);
        }
        const nextEl = document.getElementById('next-update');
        if (nextEl) {
            const m = Math.floor(nextRefreshSeconds / 60);
            const s = nextRefreshSeconds % 60;
            nextEl.innerText = `Atualização em: ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
    }
    update();
    setInterval(update, 1000);
}

// ── Inicialização do ECharts ──────────────────────────────────────────────────
function initChart() {
    const chartDom = document.getElementById('echarts-map-container');
    if (!chartDom) return;
    myChart = echarts.init(chartDom, 'dark', { renderer: 'canvas' });
    
    // Clique no mapa seleciona o estado
    myChart.on('click', function(params) {
        if (params.name) {
            selecionarEstado(params.name, true);
        }
    });

    window.addEventListener('resize', () => {
        if (myChart) myChart.resize();
    });

    // ResizeObserver garante que o mapa ECharts se adapte imediatamente a qualquer redimensionamento do container
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            if (myChart) myChart.resize();
        });
        ro.observe(chartDom);
    }
}

// ── Carregamento do GeoJSON do Brasil ─────────────────────────────────────────
async function carregarGeoJson() {
    if (isGeoJsonLoaded) return true;
    try {
        const resp = await fetch('/static/js/brazil_geo.json');
        const geoJson = await resp.json();
        echarts.registerMap('brazil', geoJson);
        isGeoJsonLoaded = true;
        if (currentData) {
            renderizarMapa(currentData);
        }
        return true;
    } catch (err) {
        console.error('Erro ao carregar brazil_geo.json:', err);
        return false;
    }
}

// ── Carregamento de Dados da API ─────────────────────────────────────────────
async function carregarDadosApi(force = false) {
    const monthEl = document.getElementById('filter-month');
    const yearEl = document.getElementById('filter-year');
    
    let mes = 9;
    if (monthEl && monthEl.value) {
        const v = parseInt(monthEl.value, 10);
        if (!isNaN(v) && v >= 1 && v <= 12) mes = v;
    }
    let ano = 2026;
    if (yearEl && yearEl.value) {
        const y = parseInt(yearEl.value, 10);
        if (!isNaN(y) && y >= 2020) ano = y;
    }

    try {
        let url = `/api/mapa_regionais?mes=${mes}&ano=${ano}`;
        if (force) url += `&refresh=1&_t=${Date.now()}`;

        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }
        const json = await resp.json();

        if (json.success && json.data) {
            currentData = json.data;
            atualizarTopCockpit(currentData);
            renderizarMapa(currentData);
            renderizarTabelaHierarquia(currentData);
            renderizarRankings(currentData);
            selecionarEstado(selectedUf || (currentData.estados[0] ? currentData.estados[0].uf : 'SP'), false);
            setTimeout(initAutoScrollTV, 800);
        } else {
            console.error('Falha na API mapa_regionais:', json.error);
            const tbody = document.getElementById('hierarchy-table-body');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#ef4444;">
                    Erro ao carregar dados: ${json.error || 'Falha na resposta'}<br>
                    <button onclick="carregarDadosApi(true)" style="margin-top:10px; padding:6px 14px; background:#ffd700; color:#000; border:none; border-radius:4px; cursor:pointer; font-weight:700;">Tentar Novamente</button>
                </td></tr>`;
            }
        }
    } catch (e) {
        console.error('Erro de conexão com /api/mapa_regionais:', e);
        const tbody = document.getElementById('hierarchy-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#ef4444;">
                Erro de conexão com o servidor (${e.message}).<br>
                <button onclick="carregarDadosApi(true)" style="margin-top:10px; padding:6px 14px; background:#ffd700; color:#000; border:none; border-radius:4px; cursor:pointer; font-weight:700;">Tentar Novamente</button>
            </td></tr>`;
        }
    }
}

// ── Atualização do Top Cockpit ────────────────────────────────────────────────
function atualizarTopCockpit(data) {
    const br = data.brasil || {};
    const liderUfEl = document.getElementById('kpi-lider-uf');
    const totalUfsEl = document.getElementById('kpi-total-ufs');
    const totalCatsEl = document.getElementById('kpi-total-cats');
    const compAnoEl = document.getElementById('kpi-comparativo-ano');

    if (liderUfEl) liderUfEl.innerText = `${br.lider_uf} (${br.lider_share}%)`;
    if (totalUfsEl) totalUfsEl.innerText = br.total_ufs || 28;
    if (totalCatsEl) totalCatsEl.innerText = br.total_categorias || 11;
    if (compAnoEl) compAnoEl.innerText = `${data.ano} vs ${data.ano_ant}`;
}

// Coordenadas geográficas dos centros de cada estado para o radar luminoso em evidência
const COORDENADAS_ESTADOS = {
    'AC': [-70.55, -9.02], 'AL': [-36.27, -9.57], 'AM': [-64.68, -4.15],
    'AP': [-51.77, 1.41], 'BA': [-41.71, -12.58], 'CE': [-39.63, -5.09],
    'DF': [-47.88, -15.79], 'ES': [-40.34, -19.18], 'GO': [-49.84, -15.83],
    'MA': [-45.27, -5.42], 'MG': [-44.55, -18.51], 'MS': [-54.54, -20.51],
    'MT': [-55.92, -12.68], 'PA': [-52.29, -3.79], 'PB': [-36.78, -7.24],
    'PE': [-37.99, -8.36], 'PI': [-42.80, -7.71], 'PR': [-51.49, -24.89],
    'RJ': [-42.87, -22.28], 'RN': [-36.56, -5.81], 'RO': [-62.82, -10.83],
    'RR': [-61.40, 2.09], 'RS': [-53.50, -29.75], 'SC': [-50.45, -27.24],
    'SE': [-37.38, -10.57], 'SP': [-48.50, -22.18], 'TO': [-48.29, -10.25]
};

// ── Renderização do Mapa do Brasil ────────────────────────────────────────────
function renderizarMapa(data) {
    if (!myChart || !isGeoJsonLoaded) return;

    const ufsMap = data.ufs_map || {};
    const regionsConfig = [];
    const activeScatter = [];

    // Se temos um estado selecionado válido com coordenadas, cria o beacon luminoso
    const selU = ufsMap[selectedUf];
    const coordSel = COORDENADAS_ESTADOS[selectedUf];
    if (coordSel && selU) {
        activeScatter.push({
            name: `${selU.nome || selectedUf} (${selectedUf})`,
            value: [...coordSel, selU.share_atual],
            uf: selectedUf,
            nome: selU.nome || selectedUf,
            share: selU.share_atual,
            status: selU.status,
            diff: selU.diff_pp
        });
    }

    // Monta estilos customizados por UF
    Object.keys(ufsMap).forEach(uf => {
        const u = ufsMap[uf];
        if (uf === 'EX') return; // Exportação não é polígono no mapa

        const isFilteredRegion = (activeRegionFilter === 'TODAS' || u.regiao === activeRegionFilter);
        const isSelected = (uf === selectedUf);

        // Cor de base conforme o share
        let areaColor = '#182234';
        if (u.share_atual >= 30) {
            areaColor = '#b45309'; // Dourado escuro / ouro
        } else if (u.share_atual >= 5) {
            areaColor = '#0369a1'; // Azul marinho
        } else if (u.share_atual >= 2) {
            areaColor = '#0f766e'; // Esmeralda escuro
        } else if (u.share_atual >= 0.5) {
            areaColor = '#334155'; // Slate
        }

        if (!isFilteredRegion) {
            areaColor = 'rgba(15, 23, 42, 0.3)';
        }

        // Cor de borda refinada e profissional (sem vermelho agressivo)
        let borderColor = 'rgba(255, 215, 0, 0.22)';
        let borderWidth = 1;
        let shadowColor = 'rgba(0, 0, 0, 0.4)';
        let shadowBlur = 4;
        let customLabel = undefined;

        if (isSelected) {
            areaColor = '#ffd700'; // Destaque em ouro absoluto
            borderColor = '#ffffff';
            borderWidth = 3;
            shadowColor = 'rgba(255, 215, 0, 1)';
            shadowBlur = 32;
            customLabel = {
                show: true,
                color: '#000000',
                fontWeight: 900,
                fontSize: 12.5,
                textBorderWidth: 0,
                formatter: function () {
                    return `${uf}\n${u.share_atual}%`;
                }
            };
        } else if (u.share_atual >= 5) {
            borderColor = 'rgba(255, 215, 0, 0.45)';
            borderWidth = 1.4;
        } else if (u.share_atual >= 1) {
            borderColor = 'rgba(255, 215, 0, 0.3)';
            borderWidth = 1;
        } else {
            borderColor = isFilteredRegion ? 'rgba(148, 163, 184, 0.22)' : 'rgba(255, 255, 255, 0.06)';
            borderWidth = 0.8;
        }

        regionsConfig.push({
            name: uf,
            itemStyle: {
                areaColor: areaColor,
                borderColor: borderColor,
                borderWidth: borderWidth,
                shadowColor: shadowColor,
                shadowBlur: shadowBlur
            },
            label: customLabel,
            emphasis: {
                itemStyle: {
                    areaColor: '#ffd700',
                    borderColor: '#ffffff',
                    borderWidth: 2.5,
                    shadowBlur: 25,
                    shadowColor: 'rgba(255, 215, 0, 0.95)'
                },
                label: {
                    show: true,
                    color: '#000000',
                    fontWeight: 900,
                    fontSize: 13,
                    textBorderWidth: 0
                }
            }
        });
    });

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(9, 14, 22, 0.95)',
            borderColor: 'rgba(255, 215, 0, 0.6)',
            borderWidth: 1.5,
            padding: [10, 14],
            textStyle: { color: '#f8fafc', fontFamily: 'Montserrat' },
            formatter: function (params) {
                if (params.seriesType === 'effectScatter') {
                    const d = params.data;
                    const stColor = d.status === 'MAIOR' ? 'var(--green)' : 'var(--red)';
                    const diffTxt = (d.diff >= 0 ? '+' : '') + d.diff + ' p.p.';
                    return `
                        <div style="font-weight:900; font-size:1.05rem; color:#ffd700; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px; margin-bottom:6px;">
                            📍 ${d.nome} (${d.uf})
                        </div>
                        <div style="font-size:0.8rem; line-height:1.6;">
                            <div>Share Atual (YTD): <b style="color:#ffd700; font-size:0.95rem;">${d.share}%</b></div>
                            <div>Variação: <b style="color:${stColor};">${d.diff >= 0 ? '▲ +' : '▼ '}${d.diff} p.p.</b></div>
                        </div>
                    `;
                }

                const uf = params.name;
                const u = ufsMap[uf];
                if (!u) return params.name;

                const stColor = u.status === 'MAIOR' ? 'var(--green)' : 'var(--red)';
                const stIcon = u.status === 'MAIOR' ? '▲' : '▼';
                const diffTxt = (u.diff_pp >= 0 ? '+' : '') + u.diff_pp + ' p.p.';

                return `
                    <div style="font-weight:900; font-size:1.05rem; color:#ffd700; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px; margin-bottom:6px;">
                        ${u.nome || uf} (${uf}) • ${u.regiao || 'Brasil'}
                    </div>
                    <div style="font-size:0.8rem; line-height:1.6;">
                        <div>Posição Ranking: <b style="color:#fff;">#${u.rank || '-'}</b></div>
                        <div>Share Atual (YTD): <b style="color:#ffd700; font-size:0.95rem;">${u.share_atual}%</b></div>
                        <div>Share Ano Anterior: <b style="color:#cbd5e1;">${u.share_ant}%</b></div>
                        <div>Variação: <b style="color:${stColor};">${stIcon} ${(u.diff_pp >= 0 ? '+' : '') + u.diff_pp} p.p.</b></div>
                    </div>
                `;
            }
        },
        geo: {
            map: 'brazil',
            roam: false,
            zoom: 1.25,
            center: [-54, -14.5],
            aspectScale: 0.88,
            nameProperty: 'sigla',
            label: {
                show: true,
                color: '#ffffff',
                fontSize: 9.5,
                fontWeight: 800,
                lineHeight: 11,
                textBorderColor: '#000000',
                textBorderWidth: 2.5,
                formatter: function (params) {
                    const uf = params.name;
                    const u = ufsMap[uf];
                    if (u && u.share_atual >= 0.1) {
                        return `${uf}\n${u.share_atual}%`;
                    }
                    return uf;
                }
            },
            itemStyle: {
                areaColor: '#101726',
                borderColor: 'rgba(255, 255, 255, 0.12)',
                borderWidth: 1
            },
            regions: regionsConfig
        },
        series: [
            {
                name: 'Estado em Evidência',
                type: 'effectScatter',
                coordinateSystem: 'geo',
                data: activeScatter,
                symbolSize: 14,
                showEffectOn: 'render',
                rippleEffect: {
                    brushType: 'stroke',
                    scale: 4,
                    period: 2
                },
                itemStyle: {
                    color: '#ffd700',
                    shadowBlur: 20,
                    shadowColor: '#ffffff'
                },
                label: {
                    show: true,
                    position: 'top',
                    distance: 12,
                    formatter: function(params) {
                        return `{badge|📍 ${params.data.uf}: ${params.data.share}%}`;
                    },
                    rich: {
                        badge: {
                            backgroundColor: 'rgba(10, 15, 24, 0.95)',
                            borderColor: '#ffd700',
                            borderWidth: 1.5,
                            color: '#ffd700',
                            fontWeight: 900,
                            fontSize: 12,
                            padding: [4, 8],
                            borderRadius: 6,
                            shadowBlur: 14,
                            shadowColor: 'rgba(0, 0, 0, 0.85)'
                        }
                    }
                },
                zlevel: 10
            }
        ]
    };

    myChart.setOption(option, true);
}

// ── Seleção e Spotlight do Estado ─────────────────────────────────────────────
function selecionarEstado(uf, autoScroll = false) {
    if (!currentData) return;
    selectedUf = uf;

    const ufsMap = currentData.ufs_map || {};
    const u = ufsMap[uf];
    if (!u) return;

    // Atualiza Spotlight
    const ufBadge = document.getElementById('spot-uf');
    const nameEl = document.getElementById('spot-nome');
    const regEl = document.getElementById('spot-regiao');
    const statusBox = document.getElementById('spot-status');
    const statusTxt = document.getElementById('spot-status-txt');
    const diffTxt = document.getElementById('spot-diff-txt');
    const shareAtualEl = document.getElementById('spot-share-atual');
    const shareAntEl = document.getElementById('spot-share-ant');
    const varPpEl = document.getElementById('spot-var-pp');
    const rankEl = document.getElementById('spot-rank');
    const topCatsEl = document.getElementById('spot-top-cats');

    if (ufBadge) ufBadge.innerText = uf;
    if (nameEl) nameEl.innerText = u.nome || uf;
    if (regEl) regEl.innerText = `Região ${u.regiao || 'Brasil'}`;

    const isMaior = u.status === 'MAIOR';
    if (statusBox) {
        statusBox.className = `spotlight-status-badge ${isMaior ? 'maior' : 'menor'}`;
    }
    if (statusTxt) statusTxt.innerText = isMaior ? '▲' : '▼';
    if (diffTxt) {
        diffTxt.innerText = `${u.diff_pp >= 0 ? '+' : ''}${u.diff_pp} p.p.`;
        diffTxt.style.color = isMaior ? 'var(--green)' : 'var(--red)';
    }

    if (shareAtualEl) shareAtualEl.innerText = `${u.share_atual}%`;
    if (shareAntEl) shareAntEl.innerText = `${u.share_ant}%`;
    if (varPpEl) {
        varPpEl.innerText = `${u.diff_pp >= 0 ? '+' : ''}${u.diff_pp} p.p.`;
        varPpEl.style.color = isMaior ? 'var(--green)' : 'var(--red)';
    }
    if (rankEl) rankEl.innerText = `${u.rank || 1}º Lugar`;

    // Busca categorias dessa UF
    const estadoObj = (currentData.estados || []).find(e => e.uf === uf);
    if (topCatsEl && estadoObj && estadoObj.categorias) {
        topCatsEl.innerHTML = '<span style="color:#94a3b8; font-weight:700;">Top Categorias na UF:</span> ' +
            estadoObj.categorias.slice(0, 4).map(c => `
                <div class="spot-cat-pill">
                    <span>${c.categoria}:</span>
                    <b>${c.share_atual}%</b>
                    <small style="color:${c.status === 'MAIOR' ? 'var(--green)' : 'var(--red)'};">${c.diff_pp >= 0 ? '+' : ''}${c.diff_pp}</small>
                </div>
            `).join('');
    }

    // Destaca linha na tabela e expande categorias e produtos
    if (autoScroll && uf !== 'EX') {
        expandedUfs.add(uf);
        if (estadoObj && estadoObj.categorias && estadoObj.categorias.length > 0) {
            // Expande também a categoria líder da UF para expor seus produtos na tabela
            expandedCats.add(`${uf}_${estadoObj.categorias[0].categoria}`);
        }
        renderizarTabelaHierarquia(currentData);
        setTimeout(() => {
            const targetRow = document.querySelector(`.row-uf[data-uf="${uf}"]`);
            if (targetRow) {
                targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 50);
    } else {
        document.querySelectorAll('.row-uf').forEach(row => {
            row.classList.toggle('selected', row.getAttribute('data-uf') === uf);
        });
    }

    // Atualiza mapa com destaque em evidência máxima
    renderizarMapa(currentData);
}

// ── Renderização da Tabela Hierárquica ─────────────────────────────────────────
function renderizarTabelaHierarquia(data) {
    const tbody = document.getElementById('hierarchy-table-body');
    if (!tbody || !data || !data.estados) return;

    let html = '';

    data.estados.forEach(est => {
        const isUfExpanded = expandedUfs.has(est.uf);
        const isMaior = est.status === 'MAIOR';
        const diffStr = (isMaior ? '▲ ' : '▼ ') + (est.diff_pp >= 0 ? '+' : '') + est.diff_pp + ' p.p.';

        // Nível 1: Estado
        html += `
            <tr class="row-uf ${est.uf === selectedUf ? 'selected' : ''}" data-uf="${est.uf}" onclick="onRowUfClick('${est.uf}', event)">
                <td style="text-align:center; font-weight:800; color:var(--gold);">${est.rank}</td>
                <td>
                    <span class="toggle-icon ${isUfExpanded ? 'expanded' : ''}" onclick="toggleUfExpand('${est.uf}', event)">▶</span>
                    <span class="uf-tag">${est.uf}</span>
                    <span class="uf-name-sub">${est.nome}</span>
                </td>
                <td style="text-align:right;" class="val-share gold">${est.share_atual}%</td>
                <td style="text-align:right;" class="val-share">${est.share_ant}%</td>
                <td style="text-align:right;" class="val-diff ${isMaior ? 'positive' : 'negative'}">${diffStr}</td>
            </tr>
        `;

        // Se o Estado estiver expandido, renderiza as Categorias
        if (isUfExpanded && est.categorias) {
            est.categorias.forEach(cat => {
                const catKey = `${est.uf}_${cat.categoria}`;
                const isCatExpanded = expandedCats.has(catKey);
                const isCatMaior = cat.status === 'MAIOR';
                const catDiffStr = (isCatMaior ? '▲ ' : '▼ ') + (cat.diff_pp >= 0 ? '+' : '') + cat.diff_pp + ' p.p.';

                html += `
                    <tr class="row-cat" data-cat-key="${catKey}" onclick="toggleCatExpand('${catKey}', event)">
                        <td style="text-align:center; color:#94a3b8; font-size:0.68rem;">${cat.rank}</td>
                        <td class="cat-indent">
                            <span class="toggle-icon ${isCatExpanded ? 'expanded' : ''}">▶</span>
                            <span class="cat-name-txt">📦 ${cat.categoria}</span>
                        </td>
                        <td style="text-align:right;" class="val-share">${cat.share_atual}%</td>
                        <td style="text-align:right; color:#94a3b8;">${cat.share_ant}%</td>
                        <td style="text-align:right;" class="val-diff ${isCatMaior ? 'positive' : 'negative'}">${catDiffStr}</td>
                    </tr>
                `;

                // Se a Categoria estiver expandida, renderiza os Produtos
                if (isCatExpanded && cat.produtos) {
                    cat.produtos.slice(0, 10).forEach(prod => {
                        const isProdMaior = prod.status === 'MAIOR';
                        const prodDiffStr = (isProdMaior ? '▲ ' : '▼ ') + (prod.diff_pp >= 0 ? '+' : '') + prod.diff_pp + ' p.p.';

                        html += `
                            <tr class="row-prod">
                                <td style="text-align:center; font-size:0.65rem; color:#64748b;">${prod.rank}º</td>
                                <td class="prod-indent" title="${prod.produto}">
                                    <span class="prod-rank-badge">#${prod.rank}</span>
                                    <span>${prod.produto}</span>
                                </td>
                                <td style="text-align:right; font-weight:700; color:#e2e8f0;">${prod.share_atual}%</td>
                                <td style="text-align:right; color:#64748b;">${prod.share_ant}%</td>
                                <td style="text-align:right;" class="val-diff ${isProdMaior ? 'positive' : 'negative'}">${prodDiffStr}</td>
                            </tr>
                        `;
                    });
                }
            });
        }
    });

    tbody.innerHTML = html;
}

// ── Interações na Tabela ──────────────────────────────────────────────────────
function onRowUfClick(uf, event) {
    selecionarEstado(uf, false);
}

function toggleUfExpand(uf, event) {
    if (event) event.stopPropagation();
    if (expandedUfs.has(uf)) {
        expandedUfs.delete(uf);
    } else {
        expandedUfs.add(uf);
    }
    selecionarEstado(uf, false);
    renderizarTabelaHierarquia(currentData);
}

function toggleCatExpand(catKey, event) {
    if (event) event.stopPropagation();
    if (expandedCats.has(catKey)) {
        expandedCats.delete(catKey);
    } else {
        expandedCats.add(catKey);
    }
    renderizarTabelaHierarquia(currentData);
}

function expandirTodosEstados(expand) {
    if (!currentData || !currentData.estados) return;
    if (expand) {
        currentData.estados.forEach(e => {
            expandedUfs.add(e.uf);
            (e.categorias || []).forEach(c => expandedCats.add(`${e.uf}_${c.categoria}`));
        });
    } else {
        expandedUfs.clear();
        expandedCats.clear();
    }
    renderizarTabelaHierarquia(currentData);
}

function filtrarTabelaHierarquia() {
    const input = document.getElementById('input-search-hierarquia');
    const term = (input ? input.value : '').toLowerCase().trim();
    if (!currentData || !currentData.estados) return;

    if (!term) {
        renderizarTabelaHierarquia(currentData);
        return;
    }

    // Expande tudo que der match
    currentData.estados.forEach(e => {
        const matchUf = e.uf.toLowerCase().includes(term) || e.nome.toLowerCase().includes(term);
        if (matchUf) expandedUfs.add(e.uf);

        (e.categorias || []).forEach(c => {
            const matchCat = c.categoria.toLowerCase().includes(term);
            const matchProd = (c.produtos || []).some(p => p.produto.toLowerCase().includes(term));
            if (matchCat || matchProd) {
                expandedUfs.add(e.uf);
                expandedCats.add(`${e.uf}_${c.categoria}`);
            }
        });
    });

    renderizarTabelaHierarquia(currentData);
}

// ── Renderização do Painel de Rankings ────────────────────────────────────────
function renderizarRankings(data) {
    const catListEl = document.getElementById('rank-categorias-list');
    const prodListEl = document.getElementById('rank-produtos-list');

    // 1. Categorias com TUDO EXPANDIDO (exibe os produtos de cada categoria)
    if (catListEl && data.ranking_categorias) {
        catListEl.innerHTML = data.ranking_categorias.map(cat => {
            const isMaior = cat.status === 'MAIOR';
            const diffStr = (cat.diff_pp >= 0 ? '+' : '') + cat.diff_pp + ' p.p.';
            
            // Sub-lista de produtos da categoria (TUDO EXPANDIDO)
            const prods = cat.produtos || [];
            const prodsHtml = prods.length > 0 ? `
                <div class="cat-prods-expanded-list">
                    <div style="font-size:0.64rem; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:3px; padding-left:2px;">
                        ⭐ Produtos da Categoria:
                    </div>
                    ${prods.map(p => {
                        const isPMaior = p.status === 'MAIOR';
                        const pDiffStr = (p.diff_pp >= 0 ? '+' : '') + p.diff_pp + ' p.p.';
                        return `
                            <div class="cat-prod-sub-row">
                                <span class="p-sub-rank">#${p.rank}</span>
                                <span class="p-sub-name" title="${p.produto}">${p.produto}</span>
                                <span class="p-sub-share">${p.share_atual}%</span>
                                <span class="val-diff ${isPMaior ? 'positive' : 'negative'}" style="font-size:0.62rem; min-width:36px; text-align:right;">${pDiffStr}</span>
                                <span class="status-badge ${isPMaior ? 'maior' : 'menor'}" style="font-size:0.58rem; padding:1px 4px;">
                                    ${isPMaior ? '▲' : '▼'}
                                </span>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : '';

            return `
                <div class="rank-card-item">
                    <div class="rank-item-top">
                        <div class="r-pos-name">
                            <span class="r-num">#${cat.rank}</span>
                            <span style="font-size:0.82rem; font-weight:800;">${cat.categoria}</span>
                        </div>
                        <span class="r-share-badge">${cat.share_atual}%</span>
                    </div>
                    <div class="rank-bar-track">
                        <div class="rank-bar-fill" style="width:${Math.min(cat.share_atual, 100)}%;"></div>
                    </div>
                    <div class="rank-item-sub">
                        <span>Ano Ant: ${cat.share_ant}%</span>
                        <span class="val-diff ${isMaior ? 'positive' : 'negative'}">${diffStr}</span>
                        <span class="status-badge ${isMaior ? 'maior' : 'menor'}">${isMaior ? '▲' : '▼'}</span>
                    </div>
                    ${prodsHtml}
                </div>
            `;
        }).join('');
    }

    // 2. Produtos Gerais Brasil
    if (prodListEl && data.ranking_produtos) {
        prodListEl.innerHTML = data.ranking_produtos.map(p => {
            const isMaior = p.status === 'MAIOR';
            const diffStr = (p.diff_pp >= 0 ? '+' : '') + p.diff_pp + ' p.p.';
            return `
                <div class="rank-card-item">
                    <div class="rank-item-top">
                        <div class="r-pos-name" style="max-width: 72%;">
                            <span class="r-num">#${p.rank}</span>
                            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${p.produto}">${p.produto}</span>
                        </div>
                        <span class="r-share-badge">${p.share_atual}%</span>
                    </div>
                    <div class="rank-item-sub">
                        <span style="color:#e2e8f0; font-weight:600;">${p.categoria}</span>
                        <span class="val-diff ${isMaior ? 'positive' : 'negative'}">${diffStr}</span>
                        <span class="status-badge ${isMaior ? 'maior' : 'menor'}">${isMaior ? '▲' : '▼'}</span>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// ── Filtro por Região no Mapa ────────────────────────────────────────────────
function filtrarRegiaoMapa(region) {
    activeRegionFilter = region;

    document.querySelectorAll('.region-filter-chips .chip').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-region') === region);
    });

    if (currentData) {
        renderizarMapa(currentData);
    }
}

// ── Troca de Abas no Painel Lateral ──────────────────────────────────────────
function trocarPainelDetalhe(painel) {
    document.querySelectorAll('.d-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.detail-panel-content').forEach(p => p.classList.remove('active'));

    const targetBtn = document.getElementById(`tab-btn-${painel}`);
    const targetPanel = document.getElementById(`panel-${painel}`);

    if (targetBtn) targetBtn.classList.add('active');
    if (targetPanel) {
        targetPanel.classList.add('active');
        const scrollable = targetPanel.querySelector('.hierarchy-table-container, .rankings-split-grid, .rank-list');
        if (scrollable) scrollable.scrollTop = 0;
    }

    setTimeout(initAutoScrollTV, 300);
}

// ── Auto-Rotação de Estados na TV ────────────────────────────────────────────
function iniciarAutoRotacao() {
    if (autoRotateTimer) clearInterval(autoRotateTimer);

    autoRotateTimer = setInterval(() => {
        if (!isAutoRotateActive || !currentData || !currentData.estados || currentData.estados.length === 0) return;

        // Lista das UFs principais para rotacionar no mapa geográfico (exclui EX que não é polígono no mapa)
        const estadosGeograficos = currentData.estados.filter(e => e.uf !== 'EX');
        if (estadosGeograficos.length === 0) return;

        const topUfs = estadosGeograficos.slice(0, 15).map(e => e.uf);
        const currIdx = topUfs.indexOf(selectedUf);
        const nextIdx = (currIdx + 1) % topUfs.length;
        selecionarEstado(topUfs[nextIdx], true);
    }, 12000); // Muda a cada 12 segundos na TV
}

// ── Alternância Automática entre Hierarquia e Rankings na TV ────────────────
let tabAlternatorTimer = null;
function iniciarAlternanciaAbasTV() {
    if (tabAlternatorTimer) clearInterval(tabAlternatorTimer);

    const urlParams = new URLSearchParams(window.location.search);
    let activePanel = urlParams.get('tab') === 'rankings' ? 'rankings' : 'hierarquia';

    // Alterna a cada 45 segundos entre Hierarquia (Estado -> Categoria -> Produto) e Rankings
    tabAlternatorTimer = setInterval(() => {
        if (!isAutoRotateActive) return;
        activePanel = (activePanel === 'hierarquia') ? 'rankings' : 'hierarquia';
        trocarPainelDetalhe(activePanel);
    }, 45000);
}

function toggleAutoRotacao() {
    isAutoRotateActive = !isAutoRotateActive;
    const btn = document.getElementById('btn-toggle-auto');
    if (btn) {
        btn.innerText = isAutoRotateActive ? '⏸️ Rotação TV' : '▶️ Rotação TV';
        btn.style.color = isAutoRotateActive ? 'var(--gold)' : '#94a3b8';
    }
}

// ── Auto-Scroll Contínuo até o Final da Lista (TV Mode) ───────────────────────
let autoScrollIntervals = [];

function initAutoScrollTV() {
    autoScrollIntervals.forEach(clearInterval);
    autoScrollIntervals = [];

    const scrollContainers = [
        document.querySelector('.hierarchy-table-container'),
        document.getElementById('rank-categorias-list'),
        document.getElementById('rank-produtos-list'),
        document.querySelector('.rankings-split-grid')
    ].filter(Boolean);

    scrollContainers.forEach(container => {
        let isPaused = false;
        let resumeTimer = null;

        const pause = () => {
            isPaused = true;
            clearTimeout(resumeTimer);
            resumeTimer = setTimeout(() => { isPaused = false; }, 3500);
        };

        container.addEventListener('mouseenter', () => { isPaused = true; });
        container.addEventListener('mouseleave', () => { isPaused = false; });
        container.addEventListener('touchstart', () => { isPaused = true; }, { passive: true });
        container.addEventListener('touchend', () => { isPaused = false; }, { passive: true });
        container.addEventListener('wheel', pause, { passive: true });

        const interval = setInterval(() => {
            if (isPaused) return;
            // Se o contêiner estiver oculto (aba inativa), não incrementa
            if (container.offsetParent === null) return;

            const maxScroll = container.scrollHeight - container.clientHeight;
            if (maxScroll <= 5) return;

            container.scrollTop += 0.8;

            if (container.scrollTop >= maxScroll - 2) {
                isPaused = true;
                setTimeout(() => {
                    container.scrollTo({ top: 0, behavior: 'smooth' });
                    setTimeout(() => {
                        isPaused = false;
                    }, 1500);
                }, 3000); // Fica 3 segundos no final para leitura
            }
        }, 35);

        autoScrollIntervals.push(interval);
    });
}
