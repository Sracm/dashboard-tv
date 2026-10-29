/**
 * tv_rotator.js - Alternador Automático de Telas para TV (Carrossel Contínuo)
 * Intervalo de Rotação: 2.5 minutos (150 segundos) por tela
 * Intervalo de Atualização de Dados: 10 minutos (600 segundos)
 * 
 * Regra Especial de Negócio TV:
 * 1. A guia "Mensal (%)" deve permanecer SEMPRE no mês atual corrente.
 * 2. A cada 10 minutos, todas as guias recarregam dados.
 * 3. Se for detectada oscilação (para cima ou para baixo) nos canais do mês atual da guia Mensal (%):
 *    - Retorna IMEDIATAMENTE para a guia Mensal (%) no mês atual.
 *    - Subida: card pisca em verde e toca som da caixa registradora.
 *    - Queda: card pisca em vermelho e toca som da sirene de bombeiro/polícia.
 * 
 * MQ Hair - Dashboard TV
 */

(function () {
    // 19 Guias na ordem exata da barra de navegação superior
    const TV_TABS = [
        { url: '/tv', name: 'Mensal (%)' },
        { url: '/acumulado', name: 'Acumulado (%)' },
        { url: '/trimestre', name: 'Trimestre' },
        { url: '/todos_canais', name: 'Todos os Canais' },
        { url: '/categorias', name: 'Categorias' },
        { url: '/marcas', name: 'Marcas' },
        { url: '/canal/distribuicao', name: 'Distribuição' },
        { url: '/canal/ecommerce_mq', name: 'E-commerce MQ' },
        { url: '/canal/varejo_sp', name: 'Varejo SP' },
        { url: '/canal/comex', name: 'Comex' },
        { url: '/canal/regional_no_nd', name: 'Regional NO/ND' },
        { url: '/canal/regional_rj_mg_es', name: 'Reg. RJ/MG/ES' },
        { url: '/canal/regional_sul', name: 'Regional Sul' },
        { url: '/mapa_regionais?tab=hierarquia', name: 'Mapa Brasil (Hierarquia)' },
        { url: '/mapa_regionais?tab=rankings', name: 'Mapa Brasil (Rankings)' },
        { url: '/empresa', name: 'Empresa' },
        { url: '/diario_canal', name: 'Diário Canal' },
        { url: '/diario_marcas', name: 'Diário Marcas' },
        { url: '/paises', name: 'Países' },
        { url: '/teste_estoque', name: 'Estoque e Previsão' }
    ];

    // Rotação: 2.5 minutos = 150 segundos (permite teste rápido com ?rotate_time=10)
    const urlParams = new URLSearchParams(window.location.search);
    const customTime = parseInt(urlParams.get('rotate_time'), 10);
    const DEFAULT_ROTATION_SECONDS = (!isNaN(customTime) && customTime > 0) ? customTime : 150;

    // Atualização de Dados: 10 minutos = 600 segundos (permite teste com ?refresh_time=15)
    const customRefresh = parseInt(urlParams.get('refresh_time'), 10);
    const DEFAULT_DATA_REFRESH_SECONDS = (!isNaN(customRefresh) && customRefresh > 0) ? customRefresh : 600;

    let timeLeft = DEFAULT_ROTATION_SECONDS;
    let dataRefreshLeft = getSharedDataRefreshCountdown();
    let isPaused = (localStorage.getItem('tv_rotator_paused') === 'true') || (urlParams.get('norotate') === '1');
    let timerInterval = null;

    // Purga estado antigo contaminado onde Varejo Reg sobrescrevia Varejo SP
    const TV_STORAGE_SCHEMA_VERSION = 'v2_varejo_split';
    try {
        if (localStorage.getItem('tv_storage_version') !== TV_STORAGE_SCHEMA_VERSION) {
            localStorage.removeItem('tv_estado_anterior_mes_atual');
            localStorage.removeItem('tv_alerta_oscilacao_pendente');
            localStorage.setItem('tv_storage_version', TV_STORAGE_SCHEMA_VERSION);
        }
    } catch (e) {}

    // Mapeamento canônico dos canais para detecção de oscilação
    function obterChaveCanalGlobal(nome) {
        const eqName = (nome || '').toUpperCase().trim();
        if (eqName.includes('PARLUX')) return 'parlux';
        if (eqName === 'EMPRESA') return 'empresa';
        if (eqName.includes('DISTRIBUI') || eqName === 'DISTRIBUIÇÃO' || eqName === 'DISTRIBUICAO') return 'distribuicao';
        if (eqName.includes('E-COMMERCE') || eqName.includes('ECOMMERCE')) return 'ecommerce';
        if (eqName.includes('COMEX')) return 'comex';
        if (eqName.includes('VAREJO')) {
            if (eqName.includes('REG')) return 'varejo_reg';
            if (/\bSP\b/.test(eqName) || eqName.includes('- SP') || eqName.endsWith(' SP')) return 'varejo_sp';
            return 'varejo_sp';
        }
        return null;
    }

    // Gerenciador do timer de 10 minutos compartilhado entre todas as abas
    function getSharedDataRefreshCountdown() {
        const now = Date.now();
        const storedTarget = parseInt(localStorage.getItem('tv_proxima_atualizacao_dados_ts'), 10);
        if (!isNaN(storedTarget) && storedTarget > now) {
            return Math.max(1, Math.floor((storedTarget - now) / 1000));
        }
        const newTarget = now + (DEFAULT_DATA_REFRESH_SECONDS * 1000);
        localStorage.setItem('tv_proxima_atualizacao_dados_ts', String(newTarget));
        return DEFAULT_DATA_REFRESH_SECONDS;
    }

    function resetSharedDataRefreshTarget() {
        const now = Date.now();
        const newTarget = now + (DEFAULT_DATA_REFRESH_SECONDS * 1000);
        localStorage.setItem('tv_proxima_atualizacao_dados_ts', String(newTarget));
        dataRefreshLeft = DEFAULT_DATA_REFRESH_SECONDS;
    }

    // Detecta o índice da tela atual
    function getCurrentTabIndex() {
        const rawPath = window.location.pathname.toLowerCase().replace(/\/$/, '') || '/tv';
        if (rawPath === '' || rawPath === '/') return 0;
        const currentParams = new URLSearchParams(window.location.search);
        const currentTabParam = currentParams.get('tab');

        // 1. Match de rota com query param (ex: /mapa_regionais?tab=rankings)
        if (currentTabParam) {
            const withTabIdx = TV_TABS.findIndex(t => {
                const [tPath, tQuery] = t.url.toLowerCase().split('?');
                if (tPath === rawPath && tQuery) {
                    const tParams = new URLSearchParams(tQuery);
                    return tParams.get('tab') === currentTabParam.toLowerCase();
                }
                return false;
            });
            if (withTabIdx !== -1) return withTabIdx;
        }

        // 2. Match exato de pathname (sem query param)
        const exact = TV_TABS.findIndex(t => t.url.toLowerCase().split('?')[0] === rawPath);
        if (exact !== -1) return exact;

        // 3. Match de sub-rotas (ex: /canal/distribuicao)
        const partial = TV_TABS.findIndex(t => rawPath.startsWith(t.url.toLowerCase().split('?')[0]));
        if (partial !== -1) return partial;

        // 4. Caso especial para aliases de estoque
        if (rawPath.includes('estoque')) {
            const estIdx = TV_TABS.findIndex(t => t.url.includes('estoque'));
            if (estIdx !== -1) return estIdx;
        }

        return 0;
    }

    // Coleta mês e ano atuais para preservar filtros na rotação
    // Coleta mês e ano atuais para preservar filtros na rotação (blindado contra inputs estáticos e meses futuros)
    function getFilterParams() {
        const params = new URLSearchParams(window.location.search);
        const monthSelect = document.getElementById('filter-month');
        const yearSelect = document.getElementById('filter-year');

        const now = new Date();
        const mesReal = now.getMonth() + 1;
        const anoReal = now.getFullYear();

        // Se filter-month for um input hidden (estático), ignoramos para não puxar lixo antigo
        let rawMes = null;
        if (monthSelect && monthSelect.tagName === 'SELECT') {
            rawMes = monthSelect.value;
        } else if (params.get('mes')) {
            rawMes = params.get('mes');
        }

        let rawAno = (yearSelect && yearSelect.value) ? yearSelect.value : params.get('ano');

        let mes = parseInt(rawMes, 10);
        let ano = parseInt(rawAno, 10);

        if (isNaN(mes) || mes < 1 || mes > 12) mes = mesReal;
        if (isNaN(ano) || ano < 2020) ano = anoReal;

        // REGRA CRÍTICA DEFINITIVA: No ano corrente, NUNCA permitir mês futuro (ex: mês 12 em outubro = vendas 0%)
        if (ano >= anoReal && mes > mesReal) {
            mes = mesReal;
            ano = anoReal;
        }

        return { mes, ano };
    }

    // Alterna para a próxima tela
    function goToNextTab() {
        const currentIdx = getCurrentTabIndex();
        const nextIdx = (currentIdx + 1) % TV_TABS.length;
        const nextTab = TV_TABS[nextIdx];
        const { mes, ano } = getFilterParams();

        const now = new Date();
        const mesAtual = now.getMonth() + 1;
        const anoAtual = now.getFullYear();

        // REGRA MANDATÓRIA DEFINITIVA:
        // No carrossel contínuo da TV, qualquer tela em ano corrente deve abrir SEMPRE no mês atual real
        // e JAMAIS em meses futuros (Dezembro/12 em Outubro/10)!
        let targetMes = mes;
        let targetAno = ano;

        if (targetAno >= anoAtual && targetMes > mesAtual) {
            targetMes = mesAtual;
            targetAno = anoAtual;
        }

        // Guia Mensal (/tv) é sempre estritamente o mês atual
        if (nextTab.url === '/tv' || nextTab.url === '/') {
            targetMes = mesAtual;
            targetAno = anoAtual;
        }

        const sep = nextTab.url.includes('?') ? '&' : '?';
        console.log(`[TV ROTATOR] Alternando para [${nextTab.name}] (${nextTab.url}?mes=${targetMes}&ano=${targetAno})...`);
        window.location.href = `${nextTab.url}${sep}mes=${targetMes}&ano=${targetAno}`;
    }

    function updateCountdownUI() {
        const timeEl = document.getElementById('tv-rotator-time');
        const dataTimeEl = document.getElementById('tv-data-refresh-time');
        const pillEl = document.getElementById('tv-rotator-pill');
        const btnEl = document.getElementById('tv-rotator-toggle-btn');
        const dotEl = document.getElementById('tv-rotator-dot');

        if (!timeEl) return;

        if (isPaused) {
            timeEl.textContent = 'PAUSADO';
            if (pillEl) pillEl.classList.add('paused');
            if (dotEl) dotEl.classList.remove('pulse');
            if (btnEl) btnEl.textContent = '▶';
        } else {
            const min = Math.floor(timeLeft / 60);
            const sec = timeLeft % 60;
            timeEl.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
            if (pillEl) pillEl.classList.remove('paused');
            if (dotEl) dotEl.classList.add('pulse');
            if (btnEl) btnEl.textContent = '⏸';
        }

        if (dataTimeEl) {
            const dMin = Math.floor(dataRefreshLeft / 60);
            const dSec = dataRefreshLeft % 60;
            dataTimeEl.textContent = `${String(dMin).padStart(2, '0')}:${String(dSec).padStart(2, '0')}`;
        }
    }

    // Alterna pausa/play da rotação
    function togglePause(event) {
        if (event) event.stopPropagation();
        isPaused = !isPaused;
        localStorage.setItem('tv_rotator_paused', isPaused ? 'true' : 'false');
        updateCountdownUI();
    }

    // Monitoramento de Oscilação do Mês Atual (executado a cada 10 minutos em qualquer aba)
    async function executarCicloAtualizacao10Minutos() {
        const now = new Date();
        const mesAtual = now.getMonth() + 1;
        const anoAtual = now.getFullYear();

        console.log(`[TV DADOS 10 MIN] Verificando dados e oscilações do Mês Atual (${mesAtual}/${anoAtual})...`);

        try {
            const res = await fetch(`/api/vendas_tv?mes=${mesAtual}&ano=${anoAtual}&refresh=1&_t=${Date.now()}`);
            const json = await res.json();

            if (!json.success || !Array.isArray(json.data)) {
                console.warn('[TV DADOS 10 MIN] Resposta inválida da API /api/vendas_tv:', json);
                recarregarPaginaCorrenteSemOscilacao();
                return;
            }

            let estadoSalvo = {};
            try {
                estadoSalvo = JSON.parse(localStorage.getItem('tv_estado_anterior_mes_atual') || '{}');
            } catch (e) {
                estadoSalvo = {};
            }

            // Se for o primeiro ciclo, armazena estado base do mês atual
            if (Object.keys(estadoSalvo).length === 0) {
                const novoEstado = {};
                json.data.forEach((eq, idx) => {
                    const k = obterChaveCanalGlobal(eq.name) || `canal_${idx}`;
                    novoEstado[k] = {
                        percent: Number(eq.percent) || 0,
                        realizado: Number(eq.realizado) || 0,
                        meta: Number(eq.meta) || 0
                    };
                });
                localStorage.setItem('tv_estado_anterior_mes_atual', JSON.stringify(novoEstado));
                console.log('[TV DADOS 10 MIN] Estado inicial do mês atual memorizado:', novoEstado);
                recarregarPaginaCorrenteSemOscilacao();
                return;
            }

            let oscilouCima = false;
            let oscilouBaixo = false;
            const canaisAfetados = [];
            const novoEstado = { ...estadoSalvo };

            json.data.forEach((eq, idx) => {
                const k = obterChaveCanalGlobal(eq.name) || `canal_${idx}`;
                const pAtual = Number(eq.percent) || 0;
                const rAtual = Number(eq.realizado) || 0;
                const meta = Number(eq.meta) || 0;
                const ant = estadoSalvo[k];

                if (ant !== undefined) {
                    const pAnt = typeof ant === 'object' ? (Number(ant.percent) || 0) : Number(ant);
                    const rAnt = typeof ant === 'object' ? (Number(ant.realizado) || 0) : 0;
                    
                    const pAtualFmt = Number(pAtual.toFixed(1));
                    const pAntFmt = Number(pAnt.toFixed(1));
                    const deltaVisivel = Number((pAtualFmt - pAntFmt).toFixed(1));
                    const deltaR = rAtual - rAnt;

                    // Sensibilidade diferenciada:
                    // Canais com meta já superada (>= 100%): exige variação maior (>= 0.5%) para evitar repetições
                    // Canais em andamento (< 100%): exige variação padrão (>= 0.1%)
                    const deltaMinimoSubida = (pAntFmt >= 100) ? 0.5 : 0.1;

                    const subida = (meta > 0 && deltaVisivel >= deltaMinimoSubida) || (meta <= 0 && deltaR >= 1000.0);
                    const queda = (meta > 0 && deltaVisivel <= -0.1) || (meta <= 0 && deltaR <= -1000.0);

                    // 1. Oscilação para CIMA: percentual visível subiu
                    if (subida) {
                        oscilouCima = true;
                        canaisAfetados.push({ canal: k, tipo: 'cima', nome: eq.name, deltaVisivel, deltaR });
                        console.log(`[TV OSCILAÇÃO DETECTADA] 💵 SUBIDA REAL em ${eq.name}: ${pAntFmt.toFixed(1)}% -> ${pAtualFmt.toFixed(1)}% (Δ +${deltaVisivel.toFixed(1)}% >= +${deltaMinimoSubida}%)`);
                    // 2. Oscilação para BAIXO: percentual visível caiu (<= -0.1%)
                    } else if (queda) {
                        oscilouBaixo = true;
                        canaisAfetados.push({ canal: k, tipo: 'baixo', nome: eq.name, deltaVisivel, deltaR });
                        console.log(`[TV OSCILAÇÃO DETECTADA] 🚨 QUEDA REAL em ${eq.name}: ${pAntFmt.toFixed(1)}% -> ${pAtualFmt.toFixed(1)}% (Δ ${deltaVisivel.toFixed(1)}%)`);
                    }
                }

                novoEstado[k] = { percent: pAtual, realizado: rAtual, meta: meta };
            });

            // Atualiza estado anterior salvo para próximas verificações
            localStorage.setItem('tv_estado_anterior_mes_atual', JSON.stringify(novoEstado));

            // SE HOUVE OSCILAÇÃO: Regra mandatória de voltar para a guia Mensal (%)
            if (oscilouCima || oscilouBaixo) {
                const tipoFinal = oscilouCima ? 'cima' : 'baixo'; // Se ambos, celebra alta
                console.log(`[TV REGRA ESPECIAL] 🚀 Disparando alerta de oscilação (${tipoFinal}) e redirecionando para a guia Mensal (%)-Mês Atual!`);

                localStorage.setItem('tv_alerta_oscilacao_pendente', JSON.stringify({
                    tipo: tipoFinal,
                    canais: canaisAfetados,
                    timestamp: Date.now()
                }));

                const isTV = (window.location.pathname === '/tv' || window.location.pathname === '/');
                if (!isTV) {
                    // Retorna IMEDIATAMENTE para a guia Mensal (%) no mês atual
                    window.location.href = `/tv?mes=${mesAtual}&ano=${anoAtual}&alert=1`;
                    return;
                } else {
                    // Já está na tela Mensal (%), dispara o alerta imediatamente
                    timeLeft = DEFAULT_ROTATION_SECONDS; // Reinicia rotação para dar tempo de assistir
                    if (window.dispararAlertaOscilacaoPendente) {
                        window.dispararAlertaOscilacaoPendente();
                    }
                    if (window.fetchData) {
                        window.fetchData(true);
                    }
                    return;
                }
            }

            // Não houve oscilação: apenas atualiza dados da página corrente
            recarregarPaginaCorrenteSemOscilacao();

        } catch (err) {
            console.error('[TV DADOS 10 MIN] Falha na verificação de oscilação:', err);
            recarregarPaginaCorrenteSemOscilacao();
        }
    }

    function mostrarToastTV(msg, cor = '#20c997') {
        let toast = document.getElementById('tv-toast-notification');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'tv-toast-notification';
            toast.style.cssText = `
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: rgba(18, 22, 34, 0.96);
                border: 1px solid ${cor};
                color: #ffffff;
                padding: 10px 18px;
                border-radius: 8px;
                font-family: Montserrat, sans-serif;
                font-size: 0.85rem;
                font-weight: 700;
                box-shadow: 0 8px 25px rgba(0,0,0,0.7);
                z-index: 99999;
                display: flex;
                align-items: center;
                gap: 10px;
                transition: opacity 0.3s ease, transform 0.3s ease;
                pointer-events: none;
            `;
            document.body.appendChild(toast);
        }
        toast.style.borderColor = cor;
        toast.innerHTML = msg;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        setTimeout(() => {
            if (toast) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px)';
            }
        }, 5000);
    }

    // Recarrega os dados da página que está atualmente visível sem forçar troca de tela
    function recarregarPaginaCorrenteSemOscilacao() {
        const timeStr = new Date().toLocaleTimeString('pt-BR');
        mostrarToastTV(`🔄 [Atualização 10m]: Dados sincronizados às ${timeStr}. Nenhuma oscilação detectada.`, '#0dcaf0');

        const lastUp = document.getElementById('last-update');
        if (lastUp) lastUp.innerText = `Última atualização: ${timeStr}`;

        if (typeof window.fetchData === 'function') {
            window.fetchData(true);
        } else if (typeof window.carregarDados === 'function') {
            window.carregarDados();
        } else if (typeof window.carregarDadosDashboard === 'function') {
            window.carregarDadosDashboard();
        } else {
            console.log('[TV DADOS 10 MIN] Recarregando página corrente para atualizar dados...');
            window.location.reload();
        }
    }

    // Cria e insere o badge visual na barra de cabeçalho
    function mountRotatorUI() {
        if (document.getElementById('tv-rotator-pill')) return;

        const pill = document.createElement('div');
        pill.id = 'tv-rotator-pill';
        pill.className = 'tv-rotator-pill';
        pill.title = 'TV Cockpit: Rotação a cada 2.5 min | Atualização de dados a cada 10 min. Clique para Pausar/Continuar.';
        pill.innerHTML = `
            <span class="rotator-dot pulse" id="tv-rotator-dot"></span>
            <span class="rotator-label">Auto-TV:</span>
            <span class="rotator-time" id="tv-rotator-time">02:30</span>
            <span class="rotator-divider">|</span>
            <span class="rotator-data-label">Dados:</span>
            <span class="rotator-data-time" id="tv-data-refresh-time">10:00</span>
            <button type="button" class="rotator-toggle-btn" id="tv-rotator-toggle-btn" title="Pausar / Retomar Rotação">⏸️</button>
            <button type="button" class="rotator-vanhalen-btn" id="tv-rotator-vanhalen-btn" title="Tocar Van Halen - Jump (A tela só muda após o fim da música)" onclick="window.tocarVanHalenGlobal(); event.stopPropagation();">🎸 Van Halen</button>
            <button type="button" class="rotator-test-btn" id="tv-rotator-test-btn" title="Testar Alerta de Oscilação (Simula Subida e Caixa Registradora)" onclick="window.simularOscilacaoGlobal('cima', 'distribuicao'); event.stopPropagation();">⚡ Alerta</button>`;

        pill.addEventListener('click', togglePause);

        // Ancoragem inteligente no cabeçalho
        const metaInfo = document.querySelector('.header-meta-info');
        const filtersRow = document.querySelector('.filters-row');
        const headerTop = document.querySelector('.header-top');

        if (metaInfo) {
            metaInfo.insertBefore(pill, metaInfo.firstChild);
        } else if (filtersRow) {
            filtersRow.appendChild(pill);
        } else if (headerTop) {
            headerTop.appendChild(pill);
        } else {
            document.body.appendChild(pill);
        }

        updateCountdownUI();
    }

    // Ciclo de segundo a segundo
    function tick() {
        // Bloqueio de rotação: se qualquer música ou áudio de celebração estiver tocando, a tela JAMAIS muda!
        if (window.isMusicaVanHalenTocando && window.isMusicaVanHalenTocando()) {
            updateCountdownUI();
            return;
        }

        // 1. Contador de Rotação (2.5 min)
        if (!isPaused) {
            timeLeft--;
            if (timeLeft <= 0) {
                if (window.isMusicaVanHalenTocando && window.isMusicaVanHalenTocando()) {
                    timeLeft = 1; // Mantém segurando enquanto toca
                    updateCountdownUI();
                    return;
                }
                timeLeft = 0;
                updateCountdownUI();
                goToNextTab();
                return;
            }
        }

        // 2. Contador de Atualização de Dados (10 min)
        dataRefreshLeft--;
        if (dataRefreshLeft <= 0) {
            resetSharedDataRefreshTarget();
            executarCicloAtualizacao10Minutos();
        }

        updateCountdownUI();
    }

    // Inicialização ao carregar a página
    function injectRotatorStyles() {
        if (document.getElementById('tv-rotator-injected-styles')) return;
        const style = document.createElement('style');
        style.id = 'tv-rotator-injected-styles';
        style.textContent = `
            .tv-rotator-pill {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                background: rgba(19, 23, 34, 0.90);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 20px;
                padding: 4px 10px;
                font-family: Montserrat, sans-serif;
                font-size: 0.80rem;
                font-weight: 700;
                color: #e2e8f0;
                box-shadow: 0 2px 10px rgba(0,0,0,0.5);
                user-select: none;
                cursor: default;
                backdrop-filter: blur(4px);
            }
            .tv-rotator-pill.paused {
                border-color: #ffc107;
                background: rgba(255, 193, 7, 0.15);
            }
            .rotator-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #10b981;
                display: inline-block;
            }
            .rotator-dot.pulse {
                animation: rotatorDotPulse 1.5s infinite;
            }
            @keyframes rotatorDotPulse {
                0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
                100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }
            .rotator-label {
                color: #94a3b8;
                font-size: 0.72rem;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .rotator-time {
                color: #38bdf8;
                font-weight: 800;
                font-variant-numeric: tabular-nums;
            }
            .rotator-divider {
                color: rgba(255,255,255,0.2);
            }
            .rotator-data-label {
                color: #94a3b8;
                font-size: 0.72rem;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .rotator-data-time {
                color: #f59e0b;
                font-weight: 800;
                font-variant-numeric: tabular-nums;
            }
            .rotator-toggle-btn {
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.2);
                color: #ffffff;
                border-radius: 4px;
                padding: 1px 6px;
                font-size: 0.72rem;
                cursor: pointer;
                transition: all 0.2s;
            }
            .rotator-toggle-btn:hover {
                background: rgba(203, 151, 39, 0.4);
                border-color: var(--mq-gold);
            }
            .rotator-vanhalen-btn {
                background: linear-gradient(135deg, rgba(239, 68, 68, 0.4), rgba(220, 38, 38, 0.2));
                border: 1px solid #ef4444;
                color: #fca5a5;
                border-radius: 4px;
                padding: 1px 8px;
                font-size: 0.70rem;
                font-weight: 800;
                cursor: pointer;
                transition: all 0.2s;
                font-family: Montserrat, sans-serif;
                display: inline-flex;
                align-items: center;
                gap: 3px;
            }
            .rotator-vanhalen-btn:hover {
                background: #ef4444;
                color: #ffffff;
                box-shadow: 0 0 12px rgba(239, 68, 68, 0.7);
            }
            .rotator-vanhalen-btn.playing {
                background: #ef4444 !important;
                color: #ffffff !important;
                border-color: #fca5a5 !important;
                box-shadow: 0 0 15px rgba(239, 68, 68, 0.9);
                animation: vanHalenPulsing 1s infinite alternate;
            }
            @keyframes vanHalenPulsing {
                from { transform: scale(1); filter: brightness(1); }
                to { transform: scale(1.06); filter: brightness(1.25); }
            }
            .rotator-test-btn {
                background: linear-gradient(135deg, rgba(16, 185, 129, 0.35), rgba(16, 185, 129, 0.15));
                border: 1px solid #10b981;
                color: #10b981;
                border-radius: 4px;
                padding: 1px 7px;
                font-size: 0.70rem;
                font-weight: 800;
                cursor: pointer;
                transition: all 0.2s;
                font-family: Montserrat, sans-serif;
            }
            .rotator-test-btn:hover {
                background: #10b981;
                color: #000;
                box-shadow: 0 0 10px rgba(16, 185, 129, 0.6);
            }
        `;
        document.head.appendChild(style);
    }

    // Inicialização ao carregar a página
    function init() {
        injectRotatorStyles();
        mountRotatorUI();
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(tick, 1000);

        // Barra de espaço para pausar/retomar rotação se a janela tiver foco
        window.addEventListener('keydown', function (e) {
            if (e.code === 'Space' && e.target === document.body) {
                e.preventDefault();
                togglePause();
            }
        });
    }

    // Controle global de pausa para áudio/música de meta

    // ========================================================
    // Tocar Van Halen e Segurar a Tela ate Acabar
    // ========================================================
    let _vanHalenAudioObj = null;

    window.isMusicaVanHalenTocando = function () {
        if (_vanHalenAudioObj && !_vanHalenAudioObj.paused && !_vanHalenAudioObj.ended && _vanHalenAudioObj.currentTime > 0) {
            return true;
        }
        const audioEl = document.getElementById('music-sound') || document.getElementById('victory-sound');
        if (audioEl && !audioEl.paused && !audioEl.ended && audioEl.currentTime > 0) {
            return true;
        }
        return false;
    };

    window.tocarVanHalenGlobal = function () {
        let audioEl = document.getElementById('music-sound') || document.getElementById('victory-sound');
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = 'music-sound';
            audioEl.src = '/static/audio/van_halen_jump.mp3';
            audioEl.preload = 'auto';
            document.body.appendChild(audioEl);
        }
        _vanHalenAudioObj = audioEl;

        const btnVanHalen = document.getElementById('tv-rotator-vanhalen-btn');

        // Se ja estiver tocando, pausa
        if (!audioEl.paused && audioEl.currentTime > 0) {
            audioEl.pause();
            audioEl.currentTime = 0;
            if (btnVanHalen) {
                btnVanHalen.classList.remove('playing');
                btnVanHalen.innerHTML = '🎸 Van Halen';
            }
            window.tvRotator.retomarAposAudio();
            mostrarToastTV('⏸️ Musica interrompida. Rotacao restaurada.', '#f59e0b');
            return;
        }

        // Toca a musica e PAUSA a rotacao da TV
        window.tvRotator.pausarParaAudio('Van Halen - Jump');
        if (btnVanHalen) {
            btnVanHalen.classList.add('playing');
            btnVanHalen.innerHTML = '🔊 Tocando Jump...';
        }

        mostrarToastTV('🎸 <strong>Van Halen - Jump</strong> tocando! A tela so mudara apos o termino da musica.', '#ef4444');

        audioEl.currentTime = 0;
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log('[VAN HALEN] Reproducao iniciada com sucesso. Rotacao travada ate o termino.');
            }).catch(err => {
                console.warn('[VAN HALEN] Reproducao requer interacao ou falhou:', err);
                mostrarToastTV('⚠️ Clique no botao novamente para liberar o audio no navegador!', '#f59e0b');
            });
        }

        // Evento QUANDO A MUSICA ACABAR:
        audioEl.onended = function () {
            console.log('[VAN HALEN] Musica terminada! Liberando rotacao da TV...');
            if (btnVanHalen) {
                btnVanHalen.classList.remove('playing');
                btnVanHalen.innerHTML = '🎸 Van Halen';
            }
            mostrarToastTV('🏁 Fim da musica! A tela continuara a rotacao normalmente.', '#10b981');
            window.tvRotator.retomarAposAudio();
            goToNextTab();
        };
    };

    window.tvRotator = {
        pausarParaAudio: function (motivo = 'Música de Meta') {
            console.log(`[TV ROTATOR] ⏸️ Rotação pausada temporariamente para: ${motivo}`);
            isPaused = true;
            updateCountdownUI();
        },
        retomarAposAudio: function () {
            if (localStorage.getItem('tv_rotator_paused') !== 'true' && urlParams.get('norotate') !== '1') {
                console.log(`[TV ROTATOR] ▶️ Retomando rotação automática após término da música.`);
                isPaused = false;
                timeLeft = DEFAULT_ROTATION_SECONDS;
                updateCountdownUI();
            }
        }
    };

    // Simulador global para testes rápidos no console ou botões
    window.simularOscilacaoGlobal = function (tipo = 'cima', canal = 'distribuicao') {
        const now = new Date();
        const mesAtual = now.getMonth() + 1;
        const anoAtual = now.getFullYear();

        localStorage.setItem('tv_alerta_oscilacao_pendente', JSON.stringify({
            tipo: tipo,
            canais: [{ canal: canal, tipo: tipo, nome: canal.toUpperCase() }],
            timestamp: Date.now()
        }));

        const isTV = (window.location.pathname === '/tv' || window.location.pathname === '/');
        if (!isTV) {
            window.location.href = `/tv?mes=${mesAtual}&ano=${anoAtual}&alert=1`;
        } else if (window.dispararAlertaOscilacaoPendente) {
            window.dispararAlertaOscilacaoPendente();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
