let estoqueData = [];

// Funções de formatação
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString('pt-BR');
}

function renderTable(data) {
    const tbody = document.getElementById('table-body');
    const filterEmpresa = document.getElementById('filter-empresa').value;
    const filterText = document.getElementById('table-search').value.toLowerCase();
    
    tbody.innerHTML = '';
    
    // Filtrar dados
    let filteredData = data.filter(row => {
        const matchEmpresa = filterEmpresa === 'TODAS' || row.NOME_EMPRESA === filterEmpresa;
        const matchText = (row.NOME_PRODUTO && row.NOME_PRODUTO.toLowerCase().includes(filterText)) ||
                          (row.NOME_EMPRESA && row.NOME_EMPRESA.toLowerCase().includes(filterText));
        return matchEmpresa && matchText;
    });

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhum dado encontrado</td></tr>';
        return;
    }

    filteredData.forEach(row => {
        const dias = row.DIAS_COBERTURA;
        let previsaoHtml = '';
        let previsaoClass = '';

        if (dias === 9999) {
            previsaoHtml = '<span class="badge" style="background:#6c757d; color:#fff;">S/ Vendas Recentes</span>';
            previsaoClass = '';
        } else if (dias <= 10) {
            previsaoHtml = `<span class="badge" style="background:#dc3545; color:#fff; animation: pulse 1.5s infinite;">Crítico: ${dias} dias</span>`;
            previsaoClass = 'critic-row';
        } else if (dias <= 30) {
            previsaoHtml = `<span class="badge" style="background:#ffc107; color:#000;">Atenção: ${dias} dias</span>`;
        } else {
            previsaoHtml = `<span class="badge" style="background:#28a745; color:#fff;">Seguro: ${dias} dias</span>`;
        }

        const tr = document.createElement('tr');
        if (previsaoClass) tr.classList.add(previsaoClass);
        
        tr.innerHTML = `
            <td style="text-align: left; font-weight: 500;">
                <div style="font-size: 0.85em; color: #a0a0a0;">Cód: ${row.CODPROD} | Marca: ${row.MARCA || '-'}</div>
                ${row.NOME_PRODUTO}
            </td>
            <td>${row.NOME_EMPRESA}</td>
            <td style="text-align: right; color: #0dcaf0;">${formatNumber(row.VENDA_MEDIA_DIARIA)} und/dia</td>
            <td style="text-align: right; font-weight: bold;">${formatNumber(row.SALDO_ESTOQUE)} und</td>
            <td style="text-align: center;">${previsaoHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateEmpresasDropdown(data) {
    const select = document.getElementById('filter-empresa');
    const currentVal = select.value;
    
    // Obter empresas únicas
    const empresas = [...new Set(data.map(item => item.NOME_EMPRESA))].sort();
    
    select.innerHTML = '<option value="TODAS">Todas as Empresas</option>';
    empresas.forEach(emp => {
        if (!emp) return;
        const option = document.createElement('option');
        option.value = emp;
        option.textContent = emp;
        select.appendChild(option);
    });
    
    // Restaurar valor anterior se existir na nova lista
    if (empresas.includes(currentVal) || currentVal === 'TODAS') {
        select.value = currentVal;
    }
}

function filterTable() {
    renderTable(estoqueData);
}

function updateUpdateTimes() {
    const now = new Date();
    document.getElementById('last-update').textContent = `Última atualização: ${now.toLocaleTimeString()}`;
    
    const next = new Date(now.getTime() + 10 * 60000);
    document.getElementById('next-update').textContent = `Próxima atualização em: ${next.toLocaleTimeString().slice(0, 5)}`;
}

function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString();
    document.getElementById('date').textContent = now.toLocaleDateString('pt-BR');
}

setInterval(updateClock, 1000);
updateClock();

async function fetchData() {
    const btn = document.querySelector('.btn-refresh');
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';

    try {
        const response = await fetch('/api/estoque_previsao');
        const result = await response.json();
        
        if (result.success) {
            estoqueData = result.data;
            updateEmpresasDropdown(estoqueData);
            renderTable(estoqueData);
            updateUpdateTimes();
        } else {
            console.error('Erro ao buscar dados:', result.error);
        }
    } catch (error) {
        console.error('Erro de rede:', error);
    } finally {
        if (btn) btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
    }
}

// Inicializar dados ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setInterval(fetchData, 10 * 60000); // Atualizar a cada 10 min
});

// Pulse animation nativo por injetar CSS
const style = document.createElement('style');
style.innerHTML = `
@keyframes pulse {
    0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); }
    50% { transform: scale(1.05); opacity: 0.8; box-shadow: 0 0 0 10px rgba(220, 53, 69, 0); }
    100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); }
}
.critic-row td {
    background-color: rgba(220, 53, 69, 0.1) !important;
}
.badge {
    padding: 5px 10px;
    border-radius: 4px;
    font-weight: bold;
    display: inline-block;
}
`;
document.head.appendChild(style);

function navigateTab(path) {
    window.location.href = path;
}
