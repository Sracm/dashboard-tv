/**
 * MQIA Chat Widget
 * Integração: TypeSafe Jev Router (Decisão) + OpenAI GPT-4o-mini (Execução e Resposta)
 * via OpenRouter
 */

(function () {
    // Referências DOM
    const fabBtn = document.getElementById('mq-ai-fab-btn');
    const chatWindow = document.getElementById('mq-ai-chat-window');
    const closeBtn = document.getElementById('mq-ai-close-btn');
    const clearBtn = document.getElementById('mq-ai-clear-btn');
    const messagesContainer = document.getElementById('mq-ai-messages');
    const chatForm = document.getElementById('mq-ai-form');
    const chatInput = document.getElementById('mq-ai-input');
    const sendBtn = document.getElementById('mq-ai-send-btn');
    const typingIndicator = document.getElementById('mq-ai-typing');
    const chips = document.querySelectorAll('.mq-ai-chip');

    let isRequesting = false;

    // Helper: Saudação dinâmica por horário
    function getSaudacao() {
        const hora = new Date().getHours();
        if (hora >= 5 && hora < 12) {
            return "Bom dia";
        } else if (hora >= 12 && hora < 18) {
            return "Boa tarde";
        } else {
            return "Boa noite";
        }
    }

    // Helper: Ler Cookie
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
        return null;
    }

    // Helper: Formatar Nome do Usuário (regras corporativas MQ)
    function formatUserName(rawName) {
        if (!rawName) return '';
        let name = String(rawName).trim();
        // Remove email ou pontuação se vier como login
        if (name.includes('@')) {
            name = name.split('@')[0];
        }
        if (name.includes('.')) {
            name = name.replace(/\./g, ' ');
        }
        const parts = name.split(/\s+/).map(p => {
            const lower = p.toLowerCase();
            if (['da', 'de', 'do', 'das', 'dos', 'e'].includes(lower)) {
                return lower;
            }
            return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
        });

        const fullName = parts.join(' ');
        const lowerName = fullName.toLowerCase();

        // Regras de identificação da MQ:
        // Vagner Luz é tratado carinhosamente como 'Vagner'
        if (lowerName.includes('vagner')) {
            return 'Vagner';
        }
        // Rodrigos mantêm o sobrenome para diferenciação (Pinhata vs Nóbrega)
        if (lowerName.includes('pinhata')) {
            return 'Rodrigo Pinhata';
        }
        if (lowerName.includes('nobrega')) {
            return 'Rodrigo Nobrega';
        }
        if (lowerName.includes('iara')) {
            return 'Iara Teixeira';
        }
        if (lowerName.includes('antonio') || lowerName.includes('mello') || lowerName === 'admin' || lowerName.includes('administrador') || lowerName.includes('amello')) {
            return 'Antônio';
        }

        return fullName;
    }

    // Helper: Identificar Nome do Usuário Logado
    function getUserName() {
        // 1. Variável global do template se existir
        if (window.MQ_USER_NAME && typeof window.MQ_USER_NAME === 'string') {
            return formatUserName(window.MQ_USER_NAME);
        }
        // 2. Parâmetro de URL (?user=... ou ?usuario=... ou ?nome=...)
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const urlUser = urlParams.get('user') || urlParams.get('usuario') || urlParams.get('nome');
            if (urlUser) {
                const formatted = formatUserName(urlUser);
                try { localStorage.setItem('mq_user_name', formatted); } catch (e) {}
                return formatted;
            }
        } catch (e) {}

        // 3. LocalStorage salvo no login do Portal/Intranet
        try {
            const stored = localStorage.getItem('mq_user_name');
            if (stored) return formatUserName(stored);
        } catch (e) {}

        // 4. Cookie compartilhado entre portas
        const cookieUser = getCookie('mq_user_name') || getCookie('mq_user');
        if (cookieUser) {
            return formatUserName(cookieUser);
        }

        // 5. Fallback para ambiente local (localhost ou 127.0.0.1)
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return 'Antônio';
        }

        return '';
    }

    // Renderizar Saudação e Mensagem de Boas-Vindas Dinâmica
    function renderWelcomeMessage() {
        const welcomeBubble = document.getElementById('mq-ai-welcome-bubble');
        if (!welcomeBubble) return;

        const nome = getUserName();
        const saudacao = getSaudacao();
        const saudacaoCompleta = nome ? `${saudacao}, ${nome}!` : `${saudacao}!`;

        welcomeBubble.innerHTML = `
            <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>${saudacaoCompleta}</strong></p>
            <p style="margin: 0 0 10px 0;">Sou a <strong>MQIA</strong>.</p>
            <p style="margin: 0 0 10px 0;">Minha análise cruza dados e objetivos para trazer clareza às suas decisões.</p>
            <p style="margin: 0;">Estou pronta e à disposição para o diagnóstico de hoje. Por qual indicador começamos?</p>
        `;
    }

    // Inicializa a saudação na carga da página
    renderWelcomeMessage();

    // Toggle da Janela
    if (fabBtn && chatWindow) {
        fabBtn.addEventListener('click', () => {
            const isHidden = chatWindow.classList.contains('hidden');
            if (isHidden) {
                renderWelcomeMessage();
                chatWindow.classList.remove('hidden');
                chatInput.focus();
                scrollToBottom();
            } else {
                chatWindow.classList.add('hidden');
            }
        });
    }

    if (closeBtn && chatWindow) {
        closeBtn.addEventListener('click', () => {
            chatWindow.classList.add('hidden');
        });
    }

    if (clearBtn && messagesContainer) {
        clearBtn.addEventListener('click', () => {
            const allMsgs = messagesContainer.querySelectorAll('.mq-ai-msg:not(.welcome-msg)');
            allMsgs.forEach(m => m.remove());
            renderWelcomeMessage();
        });
    }

    // Chips de Ação Rápida
    if (chips) {
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const text = chip.getAttribute('data-prompt') || chip.innerText.trim();
                chatInput.value = text;
                sendMessage(text);
            });
        });
    }

    // Envio de Mensagem pelo Formulário
    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (text && !isRequesting) {
                sendMessage(text);
            }
        });
    }

    function scrollToBottom() {
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    function formatMarkdown(text) {
        if (!text) return '';
        // Escape HTML
        let escaped = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // Negritos: **texto**
        escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Itálicos: *texto*
        escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Listas de traço: - item
        escaped = escaped.replace(/^\s*-\s+(.+)$/gm, '<li>$1</li>');
        escaped = escaped.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

        // Quebras de linha
        escaped = escaped.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');

        return escaped;
    }

    function appendUserMessage(text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'mq-ai-msg user';
        msgDiv.innerHTML = `<div class="mq-ai-msg-bubble">${formatMarkdown(text)}</div>`;
        messagesContainer.insertBefore(msgDiv, typingIndicator);
        scrollToBottom();
    }

    function appendAssistantMessage(responseHtml, decision) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'mq-ai-msg assistant';

        msgDiv.innerHTML = `
            <div class="mq-ai-msg-bubble">
                ${formatMarkdown(responseHtml)}
            </div>
        `;

        messagesContainer.insertBefore(msgDiv, typingIndicator);
        scrollToBottom();
    }

    async function sendMessage(text) {
        if (!text || isRequesting) return;

        appendUserMessage(text);
        chatInput.value = '';

        // Coletar contexto atual da tela
        const urlParams = new URLSearchParams(window.location.search);
        const mesFiltro = document.getElementById('filter-month')?.value || urlParams.get('mes') || new Date().getMonth() + 1;
        const anoFiltro = document.getElementById('filter-year')?.value || urlParams.get('ano') || new Date().getFullYear();

        const context = {
            pagina: document.title || 'Dashboard TV',
            usuario: getUserName() || 'Usuário',
            mes: parseInt(mesFiltro),
            ano: parseInt(anoFiltro),
            url: window.location.pathname
        };

        // Ativa estado de carregamento
        isRequesting = true;
        sendBtn.disabled = true;
        typingIndicator.style.display = 'flex';
        scrollToBottom();

        try {
            const resp = await fetch('/api/ai-agent/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: text,
                    context: context
                })
            });

            const data = await resp.json();

            if (data.success) {
                appendAssistantMessage(data.response, data.decision);
            } else {
                appendAssistantMessage(`⚠️ Desculpe, não consegui processar a resposta: ${data.error || 'Erro desconhecido'}`, null);
            }
        } catch (err) {
            console.error('[MQIA] Erro na requisição:', err);
            appendAssistantMessage(`⚠️ Erro de conexão com o agente de IA: ${err.message}`, null);
        } finally {
            isRequesting = false;
            sendBtn.disabled = false;
            typingIndicator.style.display = 'none';
            scrollToBottom();
        }
    }
})();
