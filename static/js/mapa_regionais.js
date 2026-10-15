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

// ── Inicialização ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initClock();
    initChart();
    await carregarGeoJson();
    await carregarDadosApi();
    iniciarAutoRotacao();
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
}

// ── Carregamento do GeoJSON do Brasil ─────────────────────────────────────────
async function carregarGeoJson() {
    try {
        const resp = await fetch('/static/js/brazil_geo.json');
        const geoJson = await resp.json();
        echarts.registerMap('brazil', geoJson);
    } catch (err) {
        console.error('Erro ao carregar brazil_geo.json:', err);
    }
}

// ── Carregamento de Dados da API ─────────────────────────────────────────────
async function carregarDadosApi(force = false) {
    const monthEl = document.getElementById('filter-month');
    const yearEl = document.getElementById('filter-year');
    const mes = monthEl ? monthEl.value : 9;
    const ano = yearEl ? yearEl.value : 2026;

    try {
        let url = `/api/mapa_regionais?mes=${mes}&ano=${ano}`;
        if (force) url += `&refresh=1&_t=${Date.now()}`;

        const resp = await fetch(url);
        const json = await resp.json();

        if (json.success && json.data) {
            currentData = json.data;
            atualizarTopCockpit(currentData);
            renderizarMapa(currentData);
            renderizarTabelaHierarquia(currentData);
            renderizarRankings(currentData);
            selecionarEstado(selectedUf || (currentData.estados[0] ? currentData.estados[0].uf : 'SP'), false);
        } else {
            console.error('Falha na API mapa_regionais:', json.error);
        }
    } catch (e) {
        console.error('Erro de conexão com /api/mapa_regionais:', e);
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

// ── Renderização do Mapa do Brasil ────────────────────────────────────────────
function renderizarMapa(data) {
    if (!myChart) return;

    const ufsMap = data.ufs_map || {};
    const regionsConfig = [];

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

        if (isSelected) {
            borderColor = '#ffd700';
            borderWidth = 2.5;
            shadowColor = 'rgba(255, 215, 0, 0.85)';
            shadowBlur = 16;
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
            emphasis: {
                itemStyle: {
                    areaColor: '#ffd700',
                    borderColor: '#ffffff',
                    borderWidth: 2,
                    shadowBlur: 20,
                    shadowColor: 'rgba(255, 215, 0, 0.9)'
                },
                label: {
                    show: true,
                    color: '#000000',
                    fontWeight: 900,
                    fontSize: 12,
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
            borderColor: 'rgba(255, 215, 0, 0.5)',
            borderWidth: 1.5,
            padding: [10, 14],
            textStyle: { color: '#f8fafc', fontFamily: 'Montserrat' },
            formatter: function (params) {
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
                        <div>Variação: <b style="color:${stColor};">${diffTxt}</b></div>
                        <div style="margin-top:4px;">Status: <b style="color:${stColor};">${stIcon} ${u.status}</b></div>
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
        }
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
    if (statusTxt) statusTxt.innerText = `${isMaior ? '▲ MAIOR' : '▼ MENOR'}`;
    if (diffTxt) diffTxt.innerText = `${u.diff_pp >= 0 ? '+' : ''}${u.diff_pp} p.p.`;

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

    // Destaca linha na tabela
    document.querySelectorAll('.row-uf').forEach(row => {
        row.classList.toggle('selected', row.getAttribute('data-uf') === uf);
    });

    if (autoScroll) {
        const targetRow = document.querySelector(`.row-uf[data-uf="${uf}"]`);
        if (targetRow) {
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    // Atualiza mapa com destaque
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
        const diffStr = (est.diff_pp >= 0 ? '+' : '') + est.diff_pp + ' p.p.';

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
                <td style="text-align:center;">
                    <span class="status-badge ${isMaior ? 'maior' : 'menor'}">
                        ${isMaior ? '▲ MAIOR' : '▼ MENOR'}
                    </span>
                </td>
            </tr>
        `;

        // Se o Estado estiver expandido, renderiza as Categorias
        if (isUfExpanded && est.categorias) {
            est.categorias.forEach(cat => {
                const catKey = `${est.uf}_${cat.categoria}`;
                const isCatExpanded = expandedCats.has(catKey);
                const isCatMaior = cat.status === 'MAIOR';
                const catDiffStr = (cat.diff_pp >= 0 ? '+' : '') + cat.diff_pp + ' p.p.';

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
                        <td style="text-align:center;">
                            <span class="status-badge ${isCatMaior ? 'maior' : 'menor'}">
                                ${isCatMaior ? '▲ MAIOR' : '▼ MENOR'}
                            </span>
                        </td>
                    </tr>
                `;

                // Se a Categoria estiver expandida, renderiza os Produtos
                if (isCatExpanded && cat.produtos) {
                    cat.produtos.slice(0, 10).forEach(prod => {
                        const isProdMaior = prod.status === 'MAIOR';
                        const prodDiffStr = (prod.diff_pp >= 0 ? '+' : '') + prod.diff_pp + ' p.p.';

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
                                <td style="text-align:center;">
                                    <span class="status-badge ${isProdMaior ? 'maior' : 'menor'}" style="font-size:0.62rem; padding:1px 5px;">
                                        ${isProdMaior ? '▲ MAIOR' : '▼ MENOR'}
                                    </span>
                                </td>
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

    // 1. Categorias
    if (catListEl && data.ranking_categorias) {
        catListEl.innerHTML = data.ranking_categorias.map(cat => {
            const isMaior = cat.status === 'MAIOR';
            const diffStr = (cat.diff_pp >= 0 ? '+' : '') + cat.diff_pp + ' p.p.';
            return `
                <div class="rank-card-item">
                    <div class="rank-item-top">
                        <div class="r-pos-name">
                            <span class="r-num">#${cat.rank}</span>
                            <span>${cat.categoria}</span>
                        </div>
                        <span class="r-share-badge">${cat.share_atual}%</span>
                    </div>
                    <div class="rank-bar-track">
                        <div class="rank-bar-fill" style="width:${Math.min(cat.share_atual, 100)}%;"></div>
                    </div>
                    <div class="rank-item-sub">
                        <span>Ano Ant: ${cat.share_ant}%</span>
                        <span class="val-diff ${isMaior ? 'positive' : 'negative'}">${diffStr}</span>
                        <span class="status-badge ${isMaior ? 'maior' : 'menor'}">${isMaior ? '▲ MAIOR' : '▼ MENOR'}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 2. Produtos
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
                        <span class="status-badge ${isMaior ? 'maior' : 'menor'}">${isMaior ? '▲ MAIOR' : '▼ MENOR'}</span>
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
    if (targetPanel) targetPanel.classList.add('active');
}

// ── Auto-Rotação de Estados na TV ────────────────────────────────────────────
function iniciarAutoRotacao() {
    if (autoRotateTimer) clearInterval(autoRotateTimer);

    autoRotateTimer = setInterval(() => {
        if (!isAutoRotateActive || !currentData || !currentData.estados || currentData.estados.length === 0) return;

        // Lista das UFs principais para rotacionar
        const topUfs = currentData.estados.slice(0, 10).map(e => e.uf);
        const currIdx = topUfs.indexOf(selectedUf);
        const nextIdx = (currIdx + 1) % topUfs.length;
        selecionarEstado(topUfs[nextIdx], true);
    }, 14000); // Muda a cada 14 segundos na TV
}

function toggleAutoRotacao() {
    isAutoRotateActive = !isAutoRotateActive;
    const btn = document.getElementById('btn-toggle-auto');
    if (btn) {
        btn.innerText = isAutoRotateActive ? '⏸️ Rotação TV' : '▶️ Rotação TV';
        btn.style.color = isAutoRotateActive ? 'var(--gold)' : '#94a3b8';
    }
}
