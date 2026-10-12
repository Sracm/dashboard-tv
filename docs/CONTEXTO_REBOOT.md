# CONTEXTO GUARDADO - RETOMADA PÓS-REINICIALIZAÇÃO

Data: 06/10/2026
IP Local da Máquina: 10.11.1.120

## Dashboards e Portas:
- Dashboard TV: 5050 (http://10.11.1.120:5050/tv ou http://127.0.0.1:5050/tv)
- Guia Empresa (TV): 5050 (http://10.11.1.120:5050/empresa)
- Portal Dashboards: 5000 (http://127.0.0.1:5000)
- Intranet: 5080 (http://127.0.0.1:5080)
- DRE Gestores: 5100 (http://127.0.0.1:5100)
- DRE Empresa: 5150 (http://127.0.0.1:5150)
- E-commerce Executivo: 5200 (http://127.0.0.1:5200)

## Alterações recentes aplicadas:
1. Valores em R$ completamente removidos da tela /empresa (apenas % exibidos para privacidade na TV).
2. Bug do mês 12 zerado corrigido em /api/empresa_tv (mês default fixado em Outubro/2026).
3. Cache multithreading protegido contra crash de NoneType em carregar_metas_e_setores.
4. Na Smart TV utilizar sempre: http://10.11.1.120:5050/tv

## Para religar tudo após reiniciar:
Basta digitar "\projetos" ou executar python app.py em cada pasta.
