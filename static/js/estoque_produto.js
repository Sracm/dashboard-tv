document.addEventListener('DOMContentLoaded', () => {
    loadEstoqueData();
});

let allMesesPassados = [];
let allEstoqueData = [];

// Variáveis de ordenação
let currentSortCol = null;
let currentSortDesc = false;

function loadEstoqueData() {
    console.log("Loading data from API...");
    fetch('/api/estoque')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                allMesesPassados = data.meses;
                allEstoqueData = data.data;
                populateFilters();
                applyFilters(); // render with any existing filters
            } else {
                console.error("Erro na API:", data.error);
                renderMockTable();
            }
        })
        .catch(error => {
            console.error("Erro ao buscar dados:", error);
            renderMockTable();
        });
}

// Funções de MultiSelect
function toggleCustomDropdown(filterType) {
    const menu = document.getElementById(filterType + '-select-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function toggleAllCustom(filterType, isChecked) {
    const container = document.getElementById(filterType + '-options');
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = isChecked);
    updateSelectLabel(filterType);
    applyFilters();
}

function updateSelectLabel(filterType) {
    const container = document.getElementById(filterType + '-options');
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const checked = Array.from(checkboxes).filter(cb => cb.checked);
    const label = document.getElementById(filterType + '-select-label');
    
    let prefix = '';
    if (filterType === 'marca') prefix = 'Marcas';
    if (filterType === 'grupogeral') prefix = 'Grupos Gerais';
    if (filterType === 'gruposintetico') prefix = 'Sintéticos';

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

document.addEventListener('click', (e) => {
    if (!e.target.closest('.multiselect-wrapper')) {
        ['marca', 'grupogeral', 'gruposintetico', 'grupoanalitico'].forEach(type => {
            const menu = document.getElementById(type + '-select-menu');
            if (menu) menu.style.display = 'none';
        });
    }
});

function buildFilterOptions(filterType, uniqueVals) {
    const container = document.getElementById(filterType + '-options');
    const selectAllCb = document.getElementById(filterType + '-select-all');
    if (!container) return;
    
    const currentSelected = getSelectedValues(filterType);
    const hadSelection = currentSelected.length > 0;
    
    container.innerHTML = '';
    
    uniqueVals.forEach(val => {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = val;
        
        if (hadSelection) {
            cb.checked = currentSelected.includes(val);
        } else {
            cb.checked = true;
        }
        
        cb.onchange = () => {
            updateSelectLabel(filterType);
            applyFilters();
            const allChecked = Array.from(container.querySelectorAll('input[type="checkbox"]')).every(c => c.checked);
            if (selectAllCb) selectAllCb.checked = allChecked;
        };
        
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + val));
        container.appendChild(label);
    });
    
    updateSelectLabel(filterType);
}

function populateFilters() {
    const marcaSet = new Set();
    const grupoGeralSet = new Set();
    const grupoSinteticoSet = new Set();
    const grupoAnaliticoSet = new Set();

    allEstoqueData.forEach(p => {
        if (p.marca) marcaSet.add(p.marca);
        if (p.grupo_geral) grupoGeralSet.add(p.grupo_geral);
        if (p.categoria) grupoSinteticoSet.add(p.categoria); // categoria é grupo_sintetico
        if (p.grupo_analitico) grupoAnaliticoSet.add(p.grupo_analitico);
    });

    buildFilterOptions('marca', Array.from(marcaSet).sort().filter(v => v.trim() !== ''));
    buildFilterOptions('grupogeral', Array.from(grupoGeralSet).sort().filter(v => v.trim() !== ''));
    buildFilterOptions('gruposintetico', Array.from(grupoSinteticoSet).sort().filter(v => v.trim() !== ''));
    buildFilterOptions('grupoanalitico', Array.from(grupoAnaliticoSet).sort().filter(v => v.trim() !== ''));
}

function applyFilters() {
    const codFilter = (document.getElementById('table-search') ? document.getElementById('table-search').value : '').toLowerCase();
    const nomeFilter = (document.getElementById('table-search') ? document.getElementById('table-search').value : '').toLowerCase();
    const selMarcas = getSelectedValues('marca');
    const selGeral = getSelectedValues('grupogeral');
    const selSintetico = getSelectedValues('gruposintetico');
    const selAnalitico = getSelectedValues('grupoanalitico');
    
    const filteredData = allEstoqueData.filter(prod => {
        const matchCod = String(prod.cod || "").toLowerCase().includes(codFilter);
        const matchNome = String(prod.nome || "").toLowerCase().includes(nomeFilter);
        const matchMarca = selMarcas.length === 0 || selMarcas.includes(prod.marca);
        const matchGeral = selGeral.length === 0 || selGeral.includes(prod.grupo_geral);
        const matchSintetico = selSintetico.length === 0 || selSintetico.includes(prod.categoria);
        const matchAnalitico = selAnalitico.length === 0 || selAnalitico.includes(prod.grupo_analitico);
        
        return matchCod && matchNome && matchMarca && matchGeral && matchSintetico && matchAnalitico;
    });
    
    // Aplicar ordenação
    if (currentSortCol) {
        filteredData.sort((a, b) => {
            let valA = a[currentSortCol];
            let valB = b[currentSortCol];
            
            // Tratamento para meses de venda dinâmicos (venda_0, venda_1...)
            if (currentSortCol.startsWith('venda_')) {
                let idx = parseInt(currentSortCol.split('_')[1]);
                valA = a.vendas[idx];
                valB = b.vendas[idx];
            }
            
            // Comparação de Strings
            if (typeof valA === 'string' || typeof valB === 'string') {
                return currentSortDesc ? String(valB || "").localeCompare(String(valA || "")) : String(valA || "").localeCompare(String(valB || ""));
            }
            
            // Comparação de Números
            return currentSortDesc ? valB - valA : valA - valB;
        });
    }
    
    renderTable(allMesesPassados, filteredData);
}

function sortData(colKey) {
    if (currentSortCol === colKey) {
        currentSortDesc = !currentSortDesc; // inverte a ordem
    } else {
        currentSortCol = colKey;
        currentSortDesc = true; // novo clique = começa do maior para o menor (desc)
    }
    applyFilters();
}

function getSortIcon(colKey) {
    if (currentSortCol !== colKey) return '<i class="fas fa-sort" style="color: #555; margin-left: 5px;"></i>';
    return currentSortDesc 
        ? '<i class="fas fa-sort-down" style="color: var(--gold); margin-left: 5px;"></i>' 
        : '<i class="fas fa-sort-up" style="color: var(--gold); margin-left: 5px;"></i>';
}

function renderTable(mesesPassados, produtos) {
    const thead = document.getElementById('table-header-row');
    const tbody = document.getElementById('table-body');
    
    let theadHTML = `
        <th onclick="sortData('cod')" style="cursor: pointer; text-align: center;">COD. PROD ${getSortIcon('cod')}</th>
        <th onclick="sortData('nome')" style="cursor: pointer; text-align: center;">PRODUTO ${getSortIcon('nome')}</th>
    `;
    mesesPassados.forEach((m, i) => {
        theadHTML += `<th onclick="sortData('venda_${i}')" style="cursor: pointer; text-align: center;">VENDA(+)<br>BONIF ${m} ${getSortIcon('venda_' + i)}</th>`;
    });
    theadHTML += `
        <th onclick="sortData('media')" style="cursor: pointer; text-align: center;">MEDIA<br>CONSUMO ${getSortIcon('media')}</th>
        <th onclick="sortData('estoque_emp')" style="cursor: pointer; text-align: center;">ESTOQUE<br>EMPRESA ${getSortIcon('estoque_emp')}</th>
        <th onclick="sortData('dias_estoque')" style="cursor: pointer; text-align: center;">DIAS ESTOQUE<br>CONFORME CONSUMO ${getSortIcon('dias_estoque')}</th>
        <th onclick="sortData('estoque_mcr')" style="cursor: pointer; text-align: center;">ESTOQUE<br>MCR ${getSortIcon('estoque_mcr')}</th>
        <th onclick="sortData('giro')" style="cursor: pointer; text-align: center;">GIRO DO<br>ESTOQUE ${getSortIcon('giro')}</th>
    `;
    thead.innerHTML = theadHTML;
    
    let tbodyHTML = '';
    
    // Agrupar produtos por Categoria
    const categoriesToGroup = [
        "PRANCHA",
        "SECADOR",
        "MODELADOR",
        "MAQUINA DE CORTE",
        "ESCOVA ELETRICA",
        "ESCOVA PROFISSIONAL",
        "ESCOVA USO DIARIO",
        "TESOURA",
        "SILENCIADOR",
        "SPARE PARTS",
        "OUTROS"
    ];
    const grouped = {};
    categoriesToGroup.forEach(c => grouped[c] = []);
    
    produtos.forEach(prod => {
        const nome = (prod.nome || "").toUpperCase();
        const catDB = (prod.categoria || "").toUpperCase();
        const grupoGeral = (prod.grupo_geral || "").toUpperCase();
        const grupoAnalitico = (prod.grupo_analitico || "").toUpperCase();
        
        const catNorm = catDB.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const nomeNorm = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const geralNorm = grupoGeral.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const analiticoNorm = grupoAnalitico.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        const pecasKeywords = [
            "TAMPA", "SUPORTE DO PERFIL", "MANUAL DE INSTRU", "PLACA DE CIRCUITO", 
            "CARCACA", "SILICONE", "CAIXA EMBALAGEM", "FUSIVEL", "DIODO", 
            "RESISTENCIA", "PERFIL CROMADO", "CABO DE FORCA", "CABO DE FORÇA", "PARAFUSO"
        ];
        const isSparePartKeyword = pecasKeywords.some(kw => nomeNorm.includes(kw) || nome.includes(kw));
        
        // Prioridade MÁXIMA para Spare Parts (via nome ou banco de dados)
        if (geralNorm.includes("SPARE PARTS") || analiticoNorm.includes("SPARE PARTS") || catNorm === "SPARE PARTS" || nomeNorm.includes("SPARE PARTS") || isSparePartKeyword) {
            grouped["SPARE PARTS"].push(prod);
        }
        else if (catNorm.includes("ESCOVA ELETRICA") || nomeNorm.includes("ESCOVA ELETRICA")) grouped["ESCOVA ELETRICA"].push(prod);
        else if (catNorm.includes("ESCOVA PROFISSIONAL") || nomeNorm.includes("ESCOVA PROFISSIONAL")) grouped["ESCOVA PROFISSIONAL"].push(prod);
        else if (catNorm.includes("ESCOVA USO DIARIO") || nomeNorm.includes("ESCOVA USO DIARIO")) grouped["ESCOVA USO DIARIO"].push(prod);
        else if (catNorm.includes("MAQUINA") || nomeNorm.includes("MAQUINA")) grouped["MAQUINA DE CORTE"].push(prod);
        else if (catNorm.includes("MODELADOR") || nomeNorm.includes("MODELADOR")) grouped["MODELADOR"].push(prod);
        else if (catNorm.includes("PRANCHA") || nomeNorm.includes("PRANCHA")) grouped["PRANCHA"].push(prod);
        else if (catNorm.includes("SECADOR") || nomeNorm.includes("SECADOR")) grouped["SECADOR"].push(prod);
        else if (catNorm.includes("SILENCIADOR") || nomeNorm.includes("SILENCIADOR")) grouped["SILENCIADOR"].push(prod);
        else if (catNorm.includes("TESOURA") || nomeNorm.includes("TESOURA")) grouped["TESOURA"].push(prod);
        else if (catNorm.includes("ESCOVA") || nomeNorm.includes("ESCOVA")) grouped["ESCOVA PROFISSIONAL"].push(prod); // Fallback para escovas genéricas
        else grouped["OUTROS"].push(prod);
    });
    
    const numCols = 7 + mesesPassados.length;
    
    for (const cat of categoriesToGroup) {
        if (grouped[cat].length === 0) continue;
        
        let sumMedia = 0;
        let sumEstEmp = 0;
        let sumEstMcr = 0;
        let sumVendas = new Array(mesesPassados.length).fill(0);
        
        grouped[cat].forEach(p => {
            sumMedia += p.media || 0;
            sumEstEmp += p.estoque_emp || 0;
            sumEstMcr += p.estoque_mcr || 0;
            if (p.vendas) {
                p.vendas.forEach((v, i) => {
                    sumVendas[i] += v || 0;
                });
            }
        });
        
        let catDias = sumMedia > 0 ? Math.round((sumEstEmp / sumMedia) * 30) : 0;
        let catGiro = sumMedia > 0 ? (sumEstEmp / sumMedia).toFixed(2).replace('.', ',') : "0,00";
        
        // Linha de Cabeçalho da Categoria com Totais
        let headerRow = `<tr style="background-color: #2c2c2c; color: var(--gold); font-weight: bold; border-top: 2px solid var(--gold); border-bottom: 2px solid var(--gold);">`;
        headerRow += `<td colspan="2" style="text-align: left; padding-left: 20px; font-size: 1.1rem; position: sticky; left: 0; z-index: 10; background-color: #2c2c2c !important;">${cat}</td>`;
        
        sumVendas.forEach(v => {
            headerRow += `<td style="text-align: center; font-size: 1.0rem;">${v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}</td>`;
        });
        
        headerRow += `<td style="text-align: center; font-size: 1.0rem;">${sumMedia.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}</td>`;
        headerRow += `<td style="text-align: center; font-size: 1.0rem;">${sumEstEmp.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}</td>`;
        const catBlinkClass = catDias <= 21 ? 'dias-critico-blink' : '';
        headerRow += `<td class="${catBlinkClass}" style="text-align: center; font-size: 1.0rem;">${catDias}</td>`;
        headerRow += `<td style="text-align: center; font-size: 1.0rem;">${sumEstMcr.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}</td>`;
        headerRow += `<td style="text-align: center; font-size: 1.0rem;">${catGiro}</td>`;
        headerRow += `</tr>`;
        
        tbodyHTML += headerRow;
        
        grouped[cat].forEach((prod) => {
            const dias = prod.dias_estoque;
            const barWidth = dias > 0 ? Math.min(100, dias / 2) : 0;
            const blinkClass = dias <= 21 ? 'dias-critico-blink' : '';
            
            let row = `<tr>`;
            row += `<td>${prod.cod}</td>`;
            row += `<td>${prod.nome}</td>`;
            
            prod.vendas.forEach(val => {
                row += `<td>${val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}</td>`;
            });
            
            row += `<td>${prod.media.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}</td>`;
            row += `<td>${prod.estoque_emp.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}</td>`;
            row += `<td class="${blinkClass}">${dias}</td>`;
            row += `<td>${prod.estoque_mcr.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}</td>`;
            row += `<td>${prod.giro.toString().replace('.', ',')}</td>`;
            row += `</tr>`;
            
            tbodyHTML += row;
        });
    }
    
    tbody.innerHTML = tbodyHTML;
}

function renderMockTable() {
    const thead = document.getElementById('table-header-row');
    const tbody = document.getElementById('table-body');
    const mesesPassados = [
        'ABR 26', 'MAI 26', 'JUN 26', 'JUL 26', 'AGO 26'
    ];
    let theadHTML = `
        <th>COD. PROD</th>
        <th>PRODUTO</th>
    `;
    mesesPassados.forEach(m => {
        theadHTML += `<th>VENDA(+)<br>BONIF ${m}</th>`;
    });
    theadHTML += `
        <th>MEDIA<br>CONSUMO</th>
        <th>ESTOQUE<br>EMPRESA</th>
        <th>DIAS ESTOQUE<br>CONFORME CONSUMO</th>
        <th>ESTOQUE<br>MCR</th>
        <th>GIRO DO<br>ESTOQUE</th>
    `;
    thead.innerHTML = theadHTML;
    tbody.innerHTML = '<tr><td colspan="23" style="text-align:center">Carregando dados...</td></tr>';
}
