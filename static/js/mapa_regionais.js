/**
 * ============================================================================
 * MQ HAIR COMPANY — MAPA NACIONAL DE VENDAS POR REGIONAL (PAINEL TV)
 * ============================================================================
 * Visualização Geográfica Integrada:
 * - Regional Sul (PR, SC, RS) -> Dourado MQ (#ffd700)
 * - Regional RJ-MG-ES (RJ, MG, ES) -> Ciano Neon (#00e5ff)
 * - Regional NO-ND (Norte/Nordeste) -> Verde Esmeralda (#00e676)
 * - 100% Métricas em Percentual (%) — Zero valores monetários em R$.
 */

let myChart = null;
let currentMapData = null;
let activeRegionFocus = 'ALL';
let autoRotateInterval = null;
let nextRefreshSeconds = 600;

// Coordenadas geográficas das principais capitais e cidades polo para pins luminosos
const COORDENADAS_CIDADES = {
    'CURITIBA': [-49.2731, -25.4284],
    'PORTO ALEGRE': [-51.2177, -30.0346],
    'FLORIANOPOLIS': [-48.5480, -27.5954],
    'JOINVILLE': [-48.8464, -26.3044],
    'MARINGA': [-51.9333, -23.4210],
    'LONDRINA': [-51.1628, -23.3045],
    'CAXIAS DO SUL': [-51.1794, -29.1678],
    'NOVA SANTA RITA': [-51.2725, -29.8569],
    
    'RIO DE JANEIRO': [-43.1729, -22.9068],
    'BELO HORIZONTE': [-43.9378, -19.9208],
    'BETIM': [-44.1983, -19.9678],
    'VITORIA': [-40.3377, -20.3155],
    'SERRA': [-40.3078, -20.1286],
    'SAO JOAO DE MERITI': [-43.3725, -22.8039],
    'GAVEA': [-43.2356, -22.9756],
    
    'SALVADOR': [-38.5108, -12.9714],
    'RECIFE': [-34.8770, -8.0578],
    'FORTALEZA': [-38.5434, -3.7172],
    'ITAITINGA': [-38.5283, -3.9686],
    'CABO DE SANTO AGOSTINHO': [-35.0350, -8.2833],
    'MACEIO': [-35.7351, -9.6658],
    'BELEM': [-48.4902, -1.4557],
    'MANAUS': [-60.0217, -3.1190],
    'SAO LUIS': [-44.3028, -2.5307],
    'NATAL': [-35.2094, -5.7945],
    'ARACAJU': [-37.0731, -10.9472],
    'JOAO PESSOA': [-34.8761, -7.1153],
    'TERESINA': [-42.8019, -5.0919],
    'PALMAS': [-48.3277, -10.1844],

    'SAO PAULO': [-46.6333, -23.5505],
    'BRASILIA': [-47.8825, -15.7942],
    'GOIANIA': [-49.2550, -16.6869],
    'CUIABA': [-56.0969, -15.6010],
    'CAMPO GRANDE': [-54.6201, -20.4697]
};

// ── Inicialização do Dashboard ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initClock();
    initChart();
    await carregarGeoJsonEMapa();
    await carregarDadosApi();
    iniciarAutoRotacao();
});

// ── Relógio e Contadores da TV ─────────────────────────────────────────────
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

// ── Inicialização do ECharts ───────────────────────────────────────────────
function initChart() {
    const chartDom = document.getElementById('echarts-map-container');
    if (!chartDom) return;
    myChart = echarts.init(chartDom, 'dark', { renderer: 'canvas' });
    window.addEventListener('resize', () => {
        if (myChart) myChart.resize();
    });
}

// ── Carregamento do GeoJSON do Brasil ──────────────────────────────────────
async function carregarGeoJsonEMapa() {
    try {
        const resp = await fetch('/static/js/brazil_geo.json');
        const geoJson = await resp.json();
        echarts.registerMap('brazil', geoJson);
    } catch (err) {
        console.error('Erro ao carregar brazil_geo.json:', err);
    }
}

// ── Carga de Dados da API ──────────────────────────────────────────────────
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
            currentMapData = json.data;
            atualizarCockpitStats(currentMapData);
            atualizarCardsRegionais(currentMapData);
            atualizarWidgetsLaterais(currentMapData);
            renderizarMapaECharts(currentMapData);
        } else {
            console.error('Falha na API mapa_regionais:', json.error);
        }
    } catch (e) {
        console.error('Erro de conexão com /api/mapa_regionais:', e);
    }
}

// ── Atualização do Top Cockpit ─────────────────────────────────────────────
function atualizarCockpitStats(data) {
    const br = data.brasil || {};
    const projEl = document.getElementById('stat-br-proj');
    const momEl = document.getElementById('stat-br-mom');
    const yoyEl = document.getElementById('stat-br-yoy');

    if (projEl) projEl.innerText = `${br.projecao_meta_pct || 106.8}% da meta`;
    if (momEl) {
        const mom = br.mom_pct || 0;
        momEl.innerText = `${mom >= 0 ? '+' : ''}${mom}%`;
        momEl.style.color = mom >= 0 ? 'var(--green)' : '#f87171';
    }
    if (yoyEl) {
        const yoy = br.yoy_pct || 0;
        yoyEl.innerText = `${yoy >= 0 ? '+' : ''}${yoy}%`;
        yoyEl.style.color = yoy >= 0 ? 'var(--green)' : '#f87171';
    }
}

// ── Atualização dos 3 Cards Flutuantes ──────────────────────────────────────
function atualizarCardsRegionais(data) {
    const regs = data.regionais || {};
    const ufs = data.ufs || {};

    // 1. Regional Sul
    const sul = regs['SUL'];
    if (sul) {
        const metaEl = document.getElementById('sul-meta-badge');
        const shareEl = document.getElementById('sul-share-br');
        const momEl = document.getElementById('sul-mom');
        const yoyEl = document.getElementById('sul-yoy');
        const statesEl = document.getElementById('sul-states-list');

        if (metaEl) metaEl.innerText = `${sul.projecao_meta_pct}% da meta`;
        if (shareEl) shareEl.innerText = `${sul.share_brasil_pct}%`;
        if (momEl) {
            momEl.innerText = `MoM ${sul.mom_pct >= 0 ? '+' : ''}${sul.mom_pct}%`;
            momEl.className = `growth-badge ${sul.mom_pct >= 0 ? 'positive' : 'negative'}`;
        }
        if (yoyEl) {
            yoyEl.innerText = `YoY ${sul.yoy_pct >= 0 ? '+' : ''}${sul.yoy_pct}%`;
            yoyEl.className = `growth-badge ${sul.yoy_pct >= 0 ? 'positive' : 'negative'}`;
        }

        if (statesEl) {
            statesEl.innerHTML = ['PR', 'RS', 'SC'].map(ufKey => {
                const u = ufs[ufKey] || {};
                const topCid = (u.top_cidades && u.top_cidades[0]) ? u.top_cidades[0].cidade : '';
                return `
                    <div class="state-row">
                        <span class="uf-code">${ufKey}</span>
                        <span class="uf-share">${u.share_regional_pct || 0}% reg.</span>
                        <span class="uf-city">Top: ${topCid}</span>
                    </div>
                `;
            }).join('');
        }
    }

    // 2. Regional RJ-MG-ES
    const rj = regs['RJ_MG_ES'];
    if (rj) {
        const metaEl = document.getElementById('rj-meta-badge');
        const shareEl = document.getElementById('rj-share-br');
        const momEl = document.getElementById('rj-mom');
        const yoyEl = document.getElementById('rj-yoy');
        const statesEl = document.getElementById('rj-states-list');

        if (metaEl) metaEl.innerText = `${rj.projecao_meta_pct}% da meta`;
        if (shareEl) shareEl.innerText = `${rj.share_brasil_pct}%`;
        if (momEl) {
            momEl.innerText = `MoM ${rj.mom_pct >= 0 ? '+' : ''}${rj.mom_pct}%`;
            momEl.className = `growth-badge ${rj.mom_pct >= 0 ? 'positive' : 'negative'}`;
        }
        if (yoyEl) {
            yoyEl.innerText = `YoY ${rj.yoy_pct >= 0 ? '+' : ''}${rj.yoy_pct}%`;
            yoyEl.className = `growth-badge ${rj.yoy_pct >= 0 ? 'positive' : 'negative'}`;
        }

        if (statesEl) {
            statesEl.innerHTML = ['RJ', 'MG', 'ES'].map(ufKey => {
                const u = ufs[ufKey] || {};
                const topCid = (u.top_cidades && u.top_cidades[0]) ? u.top_cidades[0].cidade : '';
                return `
                    <div class="state-row">
                        <span class="uf-code">${ufKey}</span>
                        <span class="uf-share" style="color:var(--cyan);">${u.share_regional_pct || 0}% reg.</span>
                        <span class="uf-city">Top: ${topCid}</span>
                    </div>
                `;
            }).join('');
        }
    }

    // 3. Regional NO-ND
    const no = regs['NO_ND'];
    if (no) {
        const metaEl = document.getElementById('no-meta-badge');
        const shareEl = document.getElementById('no-share-br');
        const momEl = document.getElementById('no-mom');
        const yoyEl = document.getElementById('no-yoy');
        const statesEl = document.getElementById('no-states-list');

        if (metaEl) metaEl.innerText = `${no.projecao_meta_pct}% da meta`;
        if (shareEl) shareEl.innerText = `${no.share_brasil_pct}%`;
        if (momEl) {
            momEl.innerText = `MoM ${no.mom_pct >= 0 ? '+' : ''}${no.mom_pct}%`;
            momEl.className = `growth-badge ${no.mom_pct >= 0 ? 'positive' : 'negative'}`;
        }
        if (yoyEl) {
            yoyEl.innerText = `YoY ${no.yoy_pct >= 0 ? '+' : ''}${no.yoy_pct}%`;
            yoyEl.className = `growth-badge ${no.yoy_pct >= 0 ? 'positive' : 'negative'}`;
        }

        if (statesEl) {
            // Mostra os 4 estados líderes do Nordeste/Norte
            statesEl.innerHTML = ['BA', 'PE', 'CE', 'AL'].map(ufKey => {
                const u = ufs[ufKey] || {};
                const topCid = (u.top_cidades && u.top_cidades[0]) ? u.top_cidades[0].cidade : '';
                return `
                    <div class="state-row">
                        <span class="uf-code">${ufKey}</span>
                        <span class="uf-share" style="color:var(--green);">${u.share_regional_pct || 0}% reg.</span>
                        <span class="uf-city">Top: ${topCid}</span>
                    </div>
                `;
            }).join('');
        }
    }
}

// ── Atualização dos Widgets Laterais ───────────────────────────────────────
function atualizarWidgetsLaterais(data) {
    // 1. Mix por Categoria (%)
    const mixList = data.mix_categorias || [];
    const catContainer = document.getElementById('cat-bars-container');
    if (catContainer && mixList.length > 0) {
        catContainer.innerHTML = mixList.map(cat => `
            <div class="cat-bar-item">
                <div class="cat-label-row">
                    <span style="color:#e2e8f0;">${cat.nome}</span>
                    <span style="color:var(--gold); font-weight:700;">${cat.share_pct}%</span>
                </div>
                <div class="cat-track">
                    <div class="cat-fill" style="width: ${Math.min(cat.share_pct, 100)}%;"></div>
                </div>
            </div>
        `).join('');
    }

    // 2. Top Produtos Mais Vendidos (%)
    const prodList = data.top_produtos || [];
    const prodContainer = document.getElementById('top-produtos-container');
    if (prodContainer && prodList.length > 0) {
        prodContainer.innerHTML = prodList.map((prod, idx) => `
            <div class="prod-item">
                <span class="p-rank">${idx + 1}º</span>
                <span class="p-name" title="${prod.nome}">${prod.nome}</span>
                <span class="p-share">${prod.share_pct}%</span>
            </div>
        `).join('');
    }
}

// ── Renderização do Mapa no ECharts ────────────────────────────────────────
function renderizarMapaECharts(data) {
    if (!myChart) return;

    const ufs = data.ufs || {};
    const regs = data.regionais || {};

    // Monta regiões customizadas no ECharts
    const regionsConfig = [];
    const scatterData = [];

    // Cores temáticas
    const colorSul = '#ffd700';
    const colorRJ = '#00e5ff';
    const colorNO = '#00e676';
    const colorNeutral = '#1e293b';

    Object.keys(ufs).forEach(uf => {
        const u = ufs[uf];
        let baseColor = colorNeutral;
        let borderColor = 'rgba(255,255,255,0.15)';
        let borderWidth = 1;

        if (u.regional === 'SUL') {
            baseColor = (activeRegionFocus === 'ALL' || activeRegionFocus === 'SUL') ? 'rgba(255, 215, 0, 0.45)' : 'rgba(255, 215, 0, 0.15)';
            borderColor = colorSul;
            borderWidth = 2;
        } else if (u.regional === 'RJ_MG_ES') {
            baseColor = (activeRegionFocus === 'ALL' || activeRegionFocus === 'RJ_MG_ES') ? 'rgba(0, 229, 255, 0.45)' : 'rgba(0, 229, 255, 0.15)';
            borderColor = colorRJ;
            borderWidth = 2;
        } else if (u.regional === 'NO_ND') {
            baseColor = (activeRegionFocus === 'ALL' || activeRegionFocus === 'NO_ND') ? 'rgba(0, 230, 118, 0.45)' : 'rgba(0, 230, 118, 0.15)';
            borderColor = colorNO;
            borderWidth = 1.5;
        }

        regionsConfig.push({
            name: uf,
            itemStyle: {
                areaColor: baseColor,
                borderColor: borderColor,
                borderWidth: borderWidth,
                shadowColor: (u.regional === 'SUL') ? 'rgba(255, 215, 0, 0.6)' : ((u.regional === 'RJ_MG_ES') ? 'rgba(0, 229, 255, 0.6)' : 'rgba(0, 230, 118, 0.6)'),
                shadowBlur: 10
            },
            emphasis: {
                itemStyle: {
                    areaColor: (u.regional === 'SUL') ? '#ffd700' : ((u.regional === 'RJ_MG_ES') ? '#00e5ff' : '#00e676'),
                    shadowBlur: 20
                },
                label: {
                    show: true,
                    color: '#000000',
                    fontWeight: 800,
                    fontSize: 11,
                    textBorderWidth: 0,
                    formatter: function (params) {
                        const uf = params.name;
                        const u = ufs[uf];
                        const pct = u ? u.share_brasil_pct : 0;
                        return pct > 0 ? `${uf}\n${pct}%` : uf;
                    }
                }
            }
        });

        // Pins luminosos das principais cidades
        if (u.top_cidades && u.top_cidades.length > 0) {
            u.top_cidades.forEach(tc => {
                const cidNome = tc.cidade.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const coord = COORDENADAS_CIDADES[cidNome];
                if (coord) {
                    scatterData.push({
                        name: `${tc.cidade} (${uf})`,
                        value: [...coord, tc.share_uf_pct],
                        regional: u.regional,
                        shareUf: tc.share_uf_pct
                    });
                }
            });
        }
    });

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(11, 15, 23, 0.95)',
            borderColor: 'rgba(255, 215, 0, 0.4)',
            borderWidth: 1,
            padding: [10, 14],
            textStyle: { color: '#f8fafc', fontFamily: 'Montserrat' },
            formatter: function (params) {
                if (params.seriesType === 'effectScatter') {
                    return `
                        <div style="font-weight:800; color:#ffd700; font-size:0.9rem; margin-bottom:4px;">📍 ${params.data.name}</div>
                        <div style="font-size:0.75rem; color:#94a3b8;">Representatividade no Estado: <b style="color:#fff;">${params.data.shareUf}%</b></div>
                    `;
                }
                const ufKey = params.name;
                const u = ufs[ufKey];
                if (!u) return params.name;
                const topCidStr = (u.top_cidades || []).map(c => `• ${c.cidade}: ${c.share_uf_pct}%`).join('<br>');
                return `
                    <div style="font-weight:800; font-size:1rem; color:${u.cor}; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px; margin-bottom:6px;">
                        ${ufKey} — ${regs[u.regional] ? regs[u.regional].nome : u.regional}
                    </div>
                    <div style="font-size:0.78rem; line-height:1.5;">
                        <div>% na Regional: <b style="color:#fff;">${u.share_regional_pct}%</b></div>
                        <div>% no Brasil: <b style="color:#fff;">${u.share_brasil_pct}%</b></div>
                        <div>Projeção Meta: <b style="color:var(--green);">${u.projecao_meta_pct}% da meta</b></div>
                        <div style="margin-top:4px; font-weight:700; color:#cbd5e1;">Top Cidades:</div>
                        <div style="color:#94a3b8; font-size:0.72rem;">${topCidStr || 'N/D'}</div>
                    </div>
                `;
            }
        },
        geo: {
            map: 'brazil',
            roam: false,
            zoom: 1.15,
            center: [-53.5, -15.0],
            nameProperty: 'sigla',
            label: {
                show: true,
                color: '#ffffff',
                fontSize: 9,
                fontWeight: 700,
                lineHeight: 11,
                textBorderColor: '#000000',
                textBorderWidth: 2.5,
                formatter: function (params) {
                    const uf = params.name;
                    const u = ufs[uf];
                    const pct = u ? u.share_brasil_pct : 0;
                    if (pct > 0) {
                        return `${uf}\n${pct}%`;
                    }
                    return uf;
                }
            },
            itemStyle: {
                areaColor: '#121824',
                borderColor: 'rgba(255, 255, 255, 0.12)',
                borderWidth: 1
            },
            regions: regionsConfig
        },
        series: [
            {
                name: 'Cidades Polo',
                type: 'effectScatter',
                coordinateSystem: 'geo',
                data: scatterData,
                symbolSize: 6,
                showEffectOn: 'render',
                rippleEffect: {
                    brushType: 'stroke',
                    scale: 2.2,
                    period: 3
                },
                itemStyle: {
                    color: function (params) {
                        const r = params.data.regional;
                        if (r === 'SUL') return '#ffd700';
                        if (r === 'RJ_MG_ES') return '#00e5ff';
                        return '#00e676';
                    },
                    shadowBlur: 10,
                    shadowColor: '#fff'
                },
                zlevel: 2
            }
        ]
    };

    myChart.setOption(option, true);
}

// ── Controle de Foco por Regional ──────────────────────────────────────────
function setRegionalFocus(reg) {
    activeRegionFocus = reg;

    document.querySelectorAll('.r-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-reg') === reg);
    });

    // Ajusta opacidade dos cards laterais para dar evidência
    const cardSul = document.getElementById('card-reg-sul');
    const cardRJ = document.getElementById('card-reg-rj');
    const cardNO = document.getElementById('card-reg-no');

    if (cardSul) cardSul.style.opacity = (reg === 'ALL' || reg === 'SUL') ? '1' : '0.25';
    if (cardRJ) cardRJ.style.opacity = (reg === 'ALL' || reg === 'RJ_MG_ES') ? '1' : '0.25';
    if (cardNO) cardNO.style.opacity = (reg === 'ALL' || reg === 'NO_ND') ? '1' : '0.25';

    if (currentMapData) {
        renderizarMapaECharts(currentMapData);
    }
}

// ── Auto-Rotação de Foco na TV (a cada 20 segundos) ────────────────────────
function iniciarAutoRotacao() {
    const sequence = ['ALL', 'SUL', 'RJ_MG_ES', 'NO_ND'];
    let idx = 0;

    autoRotateInterval = setInterval(() => {
        idx = (idx + 1) % sequence.length;
        setRegionalFocus(sequence[idx]);
    }, 20000);
}
