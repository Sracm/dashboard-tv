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
    // 18 Guias na ordem exata da barra de navegação superior
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

    // Mapeamento canônico dos canais para detecção de oscilação
    function obterChaveCanalGlobal(nome) {
        const eqName = (nome || '').toUpperCase().trim();
        if (eqName.includes('PARLUX')) return 'parlux';
        if (eqName === 'EMPRESA') return 'empresa';
        if (eqName.includes('DISTRIBUI') || eqName === 'DISTRIBUIÇÃO' || eqName === 'DISTRIBUICAO') return 'distribuicao';
        if (eqName.includes('E-COMMERCE') || eqName.includes('ECOMMERCE')) return 'ecommerce';
        if (eqName.includes('COMEX')) return 'comex';
        if (eqName.includes('VAREJO') && eqName.includes('SP')) return 'varejo_sp';
        if (eqName.includes('VAREJO') && eqName.includes('REG')) return 'varejo_reg';
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

        // Match exato de URL
        const exact = TV_TABS.findIndex(t => t.url.toLowerCase() === rawPath);
        if (exact !== -1) return exact;

        // Match de sub-rotas (ex: /canal/distribuicao)
        const partial = TV_TABS.findIndex(t => rawPath.startsWith(t.url.toLowerCase()));
        if (partial !== -1) return partial;

        // Caso especial para aliases de estoque
        if (rawPath.includes('estoque')) {
            const estIdx = TV_TABS.findIndex(t => t.url.includes('estoque'));
            if (estIdx !== -1) return estIdx;
        }

        return 0;
    }

    // Coleta mês e ano atuais para preservar filtros na rotação
    function getFilterParams() {
        const params = new URLSearchParams(window.location.search);
        const monthSelect = document.getElementById('filter-month');
        const yearSelect = document.getElementById('filter-year');

        let mes = monthSelect ? monthSelect.value : params.get('mes');
        let ano = yearSelect ? yearSelect.value : params.get('ano');

        if (!mes) mes = new Date().getMonth() + 1;
        if (!ano) ano = new Date().getFullYear();

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

        // REGRA MANDATÓRIA: A guia Mensal (%) deve abrir SEMPRE no mês atual
        const isNextTabTV = (nextTab.url === '/tv' || nextTab.url === '/');
        const targetMes = isNextTabTV ? mesAtual : mes;
        const targetAno = isNextTabTV ? anoAtual : ano;

        const sep = nextTab.url.includes('?') ? '&' : '?';
        console.log(`[TV ROTATOR] Alternando para [${nextTab.name}] (${nextTab.url}?mes=${targetMes}&ano=${targetAno})...`);
        window.location.href = `${nextTab.url}${sep}mes=${targetMes}&ano=${targetAno}`;
    }

    // Atualiza o display visual do rotator na barra de ferramentas
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
                        realizado: Number(eq.realizado) || 0
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
                const ant = estadoSalvo[k];

                if (ant !== undefined) {
                    const pAnt = typeof ant === 'object' ? (Number(ant.percent) || 0) : Number(ant);
                    const rAnt = typeof ant === 'object' ? (Number(ant.realizado) || 0) : 0;
                    const deltaP = pAtual - pAnt;
                    const deltaR = rAtual - rAnt;

                    // 1. Oscilação para CIMA: percentual subiu OU vendas em R$ subiram (se meta for 0)
                    if (deltaP > 0.005 || (Math.abs(deltaP) < 0.005 && deltaR > 1.0)) {
                        oscilouCima = true;
                        canaisAfetados.push({ canal: k, tipo: 'cima', nome: eq.name, deltaP, deltaR });
                        console.log(`[TV OSCILAÇÃO DETECTADA] 💵 SUBIDA em ${eq.name}: ${pAnt.toFixed(1)}% -> ${pAtual.toFixed(1)}% (+R$ ${deltaR.toFixed(2)})`);
                    // 2. Oscilação para BAIXO: percentual caiu OU vendas em R$ caíram
                    } else if (deltaP < -0.005 || (Math.abs(deltaP) < 0.005 && deltaR < -1.0)) {
                        oscilouBaixo = true;
                        canaisAfetados.push({ canal: k, tipo: 'baixo', nome: eq.name, deltaP, deltaR });
                        console.log(`[TV OSCILAÇÃO DETECTADA] 🚨 QUEDA em ${eq.name}: ${pAnt.toFixed(1)}% -> ${pAtual.toFixed(1)}% (-R$ ${Math.abs(deltaR).toFixed(2)})`);
                    }
                }

                novoEstado[k] = { percent: pAtual, realizado: rAtual };
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

    // Recarrega os dados da página que está atualmente visível sem forçar troca de tela
    function recarregarPaginaCorrenteSemOscilacao() {
        const isTV = (window.location.pathname === '/tv' || window.location.pathname === '/');
        if (isTV && window.fetchData) {
            window.fetchData(true);
        } else if (typeof window.carregarDados === 'function') {
            window.carregarDados();
        } else {
            // Em guias estáticas ou baseadas em templates Jinja2, faz reload mantendo parâmetros
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
            <button type="button" class="rotator-toggle-btn" id="tv-rotator-toggle-btn" title="Pausar / Retomar Rotação">⏸</button>
        `;

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
        // 1. Contador de Rotação (2.5 min)
        if (!isPaused) {
            timeLeft--;
            if (timeLeft <= 0) {
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
    function init() {
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

    // Simulador global para testes rápidos no console ou botões
    window.simularOscilacaoGlobal = function (tipo = 'cima', canal = 'empresa') {
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
