$dllPath = "C:\Program Files\Microsoft Power BI Desktop\bin\Microsoft.PowerBI.AdomdClient.dll"
[System.Reflection.Assembly]::LoadFrom($dllPath) | Out-Null

$p = 49689
$cs = "Data Source=localhost:$p;"
$conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($cs)
$conn.Open()

$dax1 = @"
EVALUATE
CALCULATETABLE(
    ADDCOLUMNS(
        ALL('BASE SETORES'[SETOR]),
        "VALOR_PREVISTO", [VALOR PREVISTO],
        "SOMA_METAS", [SOMA METAS],
        "PCT_META", [(%) META],
        "VALOR_FATURADO", [VALOR FATURADO]
    ),
    'CALENDARIO'[ANO] = 2026,
    'CALENDARIO'[NUMES] = 9
)
"@

$cmd = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdCommand($dax1, $conn)
$ad = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd)
$ds = New-Object System.Data.DataSet
$ad.Fill($ds) | Out-Null
$ds.Tables[0] | Format-Table -AutoSize | Out-String | Set-Content "pbi_setores_sept2026.txt" -Encoding utf8

# Also query distinct combinations of BASE SETORES
$dax2 = "EVALUATE 'BASE SETORES'"
$cmd2 = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdCommand($dax2, $conn)
$ad2 = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd2)
$ds2 = New-Object System.Data.DataSet
$ad2.Fill($ds2) | Out-Null
$ds2.Tables[0] | Format-Table -AutoSize | Out-String | Add-Content "pbi_setores_sept2026.txt" -Encoding utf8

$conn.Close()
Write-Output "Done"
