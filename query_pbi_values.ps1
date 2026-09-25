$dllPath = "C:\Program Files\Microsoft Power BI Desktop\bin\Microsoft.PowerBI.AdomdClient.dll"
[System.Reflection.Assembly]::LoadFrom($dllPath) | Out-Null

$msmdsrvPids = (Get-Process msmdsrv -ErrorAction SilentlyContinue).Id
$ports = (Get-NetTCPConnection -State Listen | Where-Object { $_.OwningProcess -in $msmdsrvPids }).LocalPort | Select-Object -Unique

Write-Host "Found SSAS ports: $ports"

foreach ($p in $ports) {
    try {
        $cs = "Data Source=localhost:$p;"
        $conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($cs)
        $conn.Open()
        Write-Host "Connected to port $p, DB: $($conn.Database)"

        # Let's inspect all tables
        $cmdTbl = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdCommand("SELECT [TABLE_NAME] FROM `$SYSTEM.DBSCHEMA_TABLES WHERE [TABLE_TYPE] = 'TABLE'", $conn)
        $adTbl = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmdTbl)
        $dsTbl = New-Object System.Data.DataSet
        $adTbl.Fill($dsTbl) | Out-Null
        $tables = $dsTbl.Tables[0] | Select-Object -ExpandProperty TABLE_NAME
        Write-Host "Tables in port $p : $($tables -join ', ')"

        $dax = @"
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
    'CALENDARIO'[MES] = 9
)
"@
        $cmd = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdCommand($dax, $conn)
        $adapter = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd)
        $ds = New-Object System.Data.DataSet
        $adapter.Fill($ds) | Out-Null
        Write-Host "Values for September 2026 by SETOR on port $p :"
        $ds.Tables[0] | Format-Table -AutoSize | Out-String | Set-Content "pbi_setores_values.txt" -Encoding utf8
        Get-Content "pbi_setores_values.txt"
        $conn.Close()
        break
    } catch {
        Write-Host "Error on port $p : $_"
    }
}
