# CONTEXTO DO PROJETO DASHBOARD TV (MQ HAIR)
> **Data de gravação:** 10/09/2026  
> **Status:** 100% Salvo, Commitado e Sincronizado no GitHub.

---

## 1. Localização e Repositório
* **Pasta Local:** `C:\Users\amello\OneDrive - MQHAIR\T.I\PROJETOS BI\ANTIGRAVITY\PROJETOS\DASHBOARD_tv`
* **Repositório GitHub (Privado):** [https://github.com/Sracm/dashboard-tv](https://github.com/Sracm/dashboard-tv)
* **Branch:** `main`
* **Git Status:** Limpo (`working tree clean`), todos os commits enviados.

---

## 2. Links de Acesso
### A. Acesso Interno (Rede / Wi-Fi da MQ / TV da Parede)
* **Guia Países (COMEX):** [http://10.11.1.162:5050/paises?mes=8&ano=2026](http://10.11.1.162:5050/paises?mes=8&ano=2026)
* **Guia Categorias:** [http://10.11.1.162:5050/categorias?mes=8&ano=2026](http://10.11.1.162:5050/categorias?mes=8&ano=2026)
* **Painel Geral TV (Mensal):** [http://10.11.1.162:5050/tv](http://10.11.1.162:5050/tv)
* **Localhost (Nesta máquina):** [http://localhost:5050/tv](http://localhost:5050/tv)

### B. Acesso Externo (Internet / Celular / Fora da Empresa)
* **URL do Túnel ngrok:** [https://dandruff-smog-unified.ngrok-free.dev/paises?mes=8&ano=2026](https://dandruff-smog-unified.ngrok-free.dev/paises?mes=8&ano=2026)
* **Geral TV:** [https://dandruff-smog-unified.ngrok-free.dev/tv](https://dandruff-smog-unified.ngrok-free.dev/tv)

---

## 3. Como Subir os Serviços Após Reiniciar a Máquina

### Passo 1: Iniciar o Servidor Flask (Dashboard)
Abra o PowerShell ou Prompt de Comando e execute:
```powershell
cd "C:\Users\amello\OneDrive - MQHAIR\T.I\PROJETOS BI\ANTIGRAVITY\PROJETOS\DASHBOARD_tv"
python app.py
```
*(O servidor subirá na porta 5050 e iniciará o aquecimento automático do cache Oracle Sankhya).*

### Passo 2: Iniciar o Acesso Externo (ngrok)
Em outro terminal:
```powershell
ngrok http 5050
```
*(Ou execute o script `iniciar_servidor_tv.bat` criado na pasta do projeto).*

---

## 4. O que foi Feito e Concluído nesta Sessão
1. **Nova Guia "Países" (COMEX):**
   - Baseada na query Oracle `vendas_comex.sql` com cálculo líquido de faturamento (`CALCULO_LIQUIDO_COM_IPI`).
   - Implementado exatamente com o padrão visual executivo da guia **Categorias**.
2. **Exclusão total do Brasil:**
   - O Brasil foi 100% filtrado no SQL e no DataFrame.
   - O ranking reflete estritamente as vendas de exportação (México 1º, Venezuela 2º, Colômbia 3º, Argentina 4º, Peru 5º...).
3. **Mês exibindo somente Percentual (%):**
   - As células dos meses exibem apenas a fatia percentual do total (`XX.X%`), ranking delta (`▲`, `▼`, `—`) e pílulas MoM/YoY.
   - Valores monetários (R$) ficam disponíveis de forma limpa no tooltip (hover).
4. **Espaçamento e Enquadramento em 1 Tela (100vh):**
   - Bloqueio total de rolagem da janela (`height: 100vh; overflow: hidden;`).
   - Barra horizontal eliminada (`overflow-x: hidden`).
   - Altura das linhas ajustada para 28px para que os dados caibam perfeitamente na tela da TV sem precisar rolar.
5. **Remoção do botão "Somente Share %":**
   - Botão excluído conforme pedido.
6. **Imagem `mundo_sem_cursor.png`:**
   - Salva em `static/img/mundo_sem_cursor.png` pronta para o tratamento visual que o usuário desejar.
7. **Sincronização com GitHub:**
   - Repositório privado criado em `https://github.com/Sracm/dashboard-tv`.
   - Código 100% commitado e atualizado no branch `main`.
