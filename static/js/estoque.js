let estoqueData = [];

function navigateTab(path) {
    if (path === '/tv' || path === '/') {
        window.location.href = '/tv';
        return;
    }
    window.location.href = path;
}

// Funções de formatação
function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return Number(num).toLocaleString('pt-BR');
}

function formatFloat(num) {
    if (num === null || num === undefined || isNaN(num)) return '0,00';
    return Number(num).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Lógica de MultiSelect customizado
function toggleCustomDropdown(filterType) {
    const menu = document.getElementById(filterType + '-select-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function toggleAllCustom(filterType, isChecked) {
    const container = document.getElementById(filterType + '-options');
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = isChecked);
    updateSelectLabel(filterType);
    filterTable();
}

function updateSelectLabel(filterType) {
    const container = document.getElementById(filterType + '-options');
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const checked = Array.from(checkboxes).filter(cb => cb.checked);
    const label = document.getElementById(filterType + '-select-label');
    
    let prefix = '';
    if (filterType === 'empresa') prefix = 'Empresas';
    if (filterType === 'categoria') prefix = 'Categorias';
    if (filterType === 'sintetico') prefix = 'Sintéticos';
    if (filterType === 'analitico') prefix = 'Analíticos';

    if (checked.length === checkboxes.length && checkboxes.length > 0) {
        label.textContent = 'Todos(as) ' + prefix;
    } else if (checked.length === 0) {
        label.textContent = 'Nenhum selecionado';
    } else if (checked.length === 1) {
        label.textContent = checked[0].value;
    } else {
        label.textContent = checked.length + ' Selecionados';
    }
}

function getSelectedValues(filterType) {
    const container = document.getElementById(filterType + '-options');
    if (!container) return [];
    const checked = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'));
    return checked.map(cb => cb.value);
}

// Fechar menus ao clicar fora
document.addEventListener('click', (e) => {
    if (!e.target.closest('.multiselect-wrapper')) {
        ['empresa', 'categoria', 'sintetico', 'analitico'].forEach(type => {
            const menu = document.getElementById(type + '-select-menu');
            if (menu) menu.style.display = 'none';
        });
    }
});

function renderTable(data) {
    try {
        const tbody = document.getElementById('table-body');
        const searchInput = document.getElementById('table-search');
        const filterText = searchInput ? searchInput.value.toLowerCase() : '';
        
        const selEmpresas = getSelectedValues('empresa');
        const selCategorias = getSelectedValues('categoria');
        const selSinteticos = getSelectedValues('sintetico');
        const selAnaliticos = getSelectedValues('analitico');
        
        if (!tbody) {
            console.error("table-body não encontrado!");
            return;
        }
        tbody.innerHTML = '';
    
        // Filtrar dados
        let filteredData = data.filter(row => {
            const matchEmpresa = selEmpresas.length === 0 || selEmpresas.includes(row.NOME_EMPRESA);
            const matchCat = selCategorias.length === 0 || selCategorias.includes(row.CATEGORIA || 'SEM CATEGORIA');
            const matchSint = selSinteticos.length === 0 || selSinteticos.includes(row.GRUPO_SINTETICO || 'SEM GRUPO');
            const matchAnalitico = selAnaliticos.length === 0 || selAnaliticos.includes(row.GRUPO_ANALITICO || 'SEM GRUPO');
            
            const matchText = (row.NOME_PRODUTO && row.NOME_PRODUTO.toLowerCase().includes(filterText)) ||
                              (row.NOME_EMPRESA && row.NOME_EMPRESA.toLowerCase().includes(filterText)) ||
                              (row.CATEGORIA && row.CATEGORIA.toLowerCase().includes(filterText));
                              
            return matchEmpresa && matchCat && matchSint && matchAnalitico && matchText;
        });

        // Atualizar KPIs
        const kpiProdutos = document.getElementById('kpi-produtos');
        const kpiSaldo = document.getElementById('kpi-saldo');
        const kpiCriticos = document.getElementById('kpi-criticos');
        
        if (kpiProdutos) kpiProdutos.textContent = formatNumber(filteredData.length);
        
        let totalSaldo = 0;
        let totalCriticos = 0;
        
        if (filteredData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Nenhum dado encontrado</td></tr>';
            if (kpiSaldo) kpiSaldo.textContent = '0 und';
            if (kpiCriticos) kpiCriticos.textContent = '0';
            return;
        }

        filteredData.forEach(row => {
            totalSaldo += (row.SALDO_ESTOQUE || 0);
            
            const dias = row.DIAS_COBERTURA;
            let previsaoHtml = '';
            let previsaoClass = '';

            if (dias === 9999 || dias > 3000) {
                previsaoHtml = '<span class="badge" style="background:#6c757d; color:#fff;">S/ Vendas Recentes</span>';
                previsaoClass = '';
            } else if (dias <= 10) {
                previsaoHtml = `<span class="badge" style="background:#dc3545; color:#fff; animation: pulse 1.5s infinite;">Crítico: ${dias} dias</span>`;
                previsaoClass = 'critic-row';
                totalCriticos++;
            } else if (dias <= 30) {
                previsaoHtml = `<span class="badge" style="background:#ffc107; color:#000;">Atenção: ${dias} dias</span>`;
            } else {
                previsaoHtml = `<span class="badge" style="background:#28a745; color:#fff;">Seguro: ${dias} dias</span>`;
            }

            const tr = document.createElement('tr');
            if (previsaoClass) tr.classList.add(previsaoClass);
            
            tr.innerHTML = `
                <td style="text-align: left; font-weight: 500;">
                    <div style="font-size: 0.85em; color: #a0a0a0;">Cód: ${row.CODPROD} | Marca: ${row.MARCA || '-'} | Cat: ${row.CATEGORIA || '-'}</div>
                    ${row.NOME_PRODUTO}
                    <div style="font-size: 0.80em; color: #777;">Sintético: ${row.GRUPO_SINTETICO || '-'} | Analítico: ${row.GRUPO_ANALITICO || '-'}</div>
                </td>
                <td style="text-align: right; color: #f8f9fa;">${formatNumber(row.QTD_VENDAS_MES)} und</td>
                <td style="text-align: right; color: #f8f9fa;">${formatFloat(row.MEDIA_VENDA_TRIMESTRE)} und</td>
                <td style="text-align: right; color: #0dcaf0;">${formatFloat(row.VENDA_MEDIA_DIARIA)} und/dia</td>
                <td style="text-align: right; font-weight: bold;">${formatNumber(row.SALDO_ESTOQUE)} und</td>
                <td style="text-align: center;">${previsaoHtml}</td>
            `;
            tbody.appendChild(tr);
        });
        
        if (kpiSaldo) kpiSaldo.textContent = formatNumber(totalSaldo) + ' und';
        if (kpiCriticos) kpiCriticos.textContent = formatNumber(totalCriticos);

    } catch (e) {
        console.error("Erro em renderTable:", e);
    }
}

function buildFilterOptions(filterType, data, fieldName) {
    const container = document.getElementById(filterType + '-options');
    const selectAllCb = document.getElementById(filterType + '-select-all');
    if (!container) return;
    
    // Obter os valores selecionados atuais
    const currentSelected = getSelectedValues(filterType);
    const hadSelection = currentSelected.length > 0;
    
    // Extrair valores unicos
    const uniqueVals = [...new Set(data.map(item => item[fieldName] || (fieldName === 'NOME_EMPRESA' ? '' : 'SEM CATEGORIA/GRUPO')))].filter(Boolean).sort();
    
    container.innerHTML = '';
    
    uniqueVals.forEach(val => {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = val;
        
        // Se já tínhamos seleção, mantém. Se for o primeiro load, vem tudo marcado
        if (hadSelection) {
            cb.checked = currentSelected.includes(val);
        } else {
            cb.checked = true;
        }
        
        cb.onchange = () => {
            updateSelectLabel(filterType);
            filterTable();
            // Verificar se deve desmarcar o "Select All"
            const allChecked = Array.from(container.querySelectorAll('input[type="checkbox"]')).every(c => c.checked);
            if (selectAllCb) selectAllCb.checked = allChecked;
        };
        
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + val));
        container.appendChild(label);
    });
    
    updateSelectLabel(filterType);
}

function updateAllDropdowns(data) {
    buildFilterOptions('empresa', data, 'NOME_EMPRESA');
    buildFilterOptions('categoria', data, 'CATEGORIA');
    buildFilterOptions('sintetico', data, 'GRUPO_SINTETICO');
    buildFilterOptions('analitico', data, 'GRUPO_ANALITICO');
}

function filterTable() {
    renderTable(estoqueData);
}

function updateUpdateTimes() {
    const now = new Date();
    const elLast = document.getElementById('last-update');
    if (elLast) elLast.textContent = `Última atualização: ${now.toLocaleTimeString()}`;
    
    const next = new Date(now.getTime() + 10 * 60000);
    const elNext = document.getElementById('next-update');
    if (elNext) elNext.textContent = `Próxima atualização em: ${next.toLocaleTimeString().slice(0, 5)}`;
}

function updateClock() {
    const now = new Date();
    const elClock = document.getElementById('clock');
    const elDate = document.getElementById('date');
    if (elClock) elClock.textContent = now.toLocaleTimeString();
    if (elDate) elDate.textContent = now.toLocaleDateString('pt-BR');
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
            // Se for o primeiro load, carrega dropdowns
            const isFirstLoad = estoqueData.length === 0;
            estoqueData = result.data;
            
            if (isFirstLoad) {
                updateAllDropdowns(estoqueData);
            }
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

document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setInterval(fetchData, 10 * 60000);
});
