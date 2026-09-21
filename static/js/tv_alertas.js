const API_ESTOQUE_URL = '/api/estoque';
let allEstoqueData = [];

document.addEventListener("DOMContentLoaded", () => {
    loadData();
});

function loadData() {
    document.getElementById('loading').style.display = 'flex';
    fetch(API_ESTOQUE_URL)
        .then(response => response.json())
        .then(data => {
            allEstoqueData = data.data || [];
            renderDashboard();
        })
        .catch(error => {
            console.error("Erro ao buscar dados:", error);
        })
        .finally(() => {
            setTimeout(() => {
                document.getElementById('loading').style.display = 'none';
            }, 500);
        });
}

function renderDashboard() {
    const container = document.getElementById('dashboard-container');
    container.innerHTML = '';

    const alertData = allEstoqueData.filter(p => {
        return p.curva === 'A' && p.dias_estoque >= 0 && p.dias_estoque < 60;
    });

    if (alertData.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; margin-top: 100px;">
                <i class="fas fa-check-circle" style="font-size: 5rem; color: var(--healthy-green); margin-bottom: 20px;"></i>
                <h2 style="color: var(--primary-text);">Nenhuma Ruptura Encontrada na Curva A</h2>
                <p style="color: var(--secondary-text);">Estoque Saudável.</p>
            </div>
        `;
        return;
    }

    const grouped = {
        "PRANCHA": [],
        "SECADOR": [],
        "MODELADOR": [],
        "ESCOVA": [],
        "TESOURA": [],
        "PARLUX": [],
        "OUTROS": []
    };

    alertData.forEach(p => {
        const nome = (p.nome || "").toUpperCase();
        if (nome.includes("PRANCHA")) grouped["PRANCHA"].push(p);
        else if (nome.includes("SECADOR")) grouped["SECADOR"].push(p);
        else if (nome.includes("MODELADOR")) grouped["MODELADOR"].push(p);
        else if (nome.includes("ESCOVA")) grouped["ESCOVA"].push(p);
        else if (nome.includes("TESOURA")) grouped["TESOURA"].push(p);
        else if (nome.includes("PARLUX")) grouped["PARLUX"].push(p);
        else grouped["OUTROS"].push(p);
    });

    const tableHTML = `
        <table class="tv-table">
            <thead>
                <tr>
                    <th style="width: 80px;">CÓDIGO</th>
                    <th>PRODUTO</th>
                    <th style="text-align: center; width: 150px;">MÉDIA CONSUMO</th>
                    <th style="text-align: center; width: 180px;">ESTOQUE EMPRESA</th>
                    <th style="text-align: center; width: 180px;">DIAS DE ESTOQUE</th>
                    <th style="text-align: center; width: 150px;">STATUS</th>
                </tr>
            </thead>
            <tbody id="tv-table-body">
            </tbody>
        </table>
    `;
    
    container.innerHTML = tableHTML;
    const tbody = document.getElementById('tv-table-body');

    for (const cat in grouped) {
        if (grouped[cat].length === 0) continue;

        grouped[cat].sort((a, b) => a.dias_estoque - b.dias_estoque);

        // Header da categoria
        const catRow = document.createElement('tr');
        catRow.className = 'category-row';
        catRow.innerHTML = `<td colspan="6">${cat}</td>`;
        tbody.appendChild(catRow);

        grouped[cat].forEach(p => {
            const isCritical = p.dias_estoque < 30;
            const badgeClass = isCritical ? 'badge-critical' : 'badge-warning';
            const statusText = isCritical ? 'RUPTURA' : 'ATENÇÃO';
            const rowClass = isCritical ? 'row-critical' : 'row-warning';

            const tr = document.createElement('tr');
            tr.className = `product-row ${rowClass}`;
            tr.innerHTML = `
                <td class="col-cod">${p.cod}</td>
                <td class="col-nome">${p.nome}</td>
                <td class="col-center">${p.media}</td>
                <td class="col-center font-bold" style="font-size:1.2rem;">${p.estoque_emp} <span style="font-size:0.8rem;color:#A0A0A0;">cx</span></td>
                <td class="col-center">
                    <div class="dias-circle ${badgeClass}">${p.dias_estoque}</div>
                </td>
                <td class="col-center">
                    <span class="status-badge ${badgeClass}">${statusText}</span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// Atualizar a cada 5 minutos
setInterval(loadData, 300000);
