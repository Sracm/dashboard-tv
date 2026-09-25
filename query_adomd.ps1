$dllPath = "C:\Program Files\Microsoft Power BI Desktop\bin\Microsoft.PowerBI.AdomdClient.dll"
[System.Reflection.Assembly]::LoadFrom($dllPath) | Out-Null
Write-Host "Loaded Microsoft.PowerBI.AdomdClient.dll"

$ports = @(49686, 49689)
foreach ($p in $ports) {
    try {
        $cs = "Data Source=localhost:$p;"
        $conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($cs)
        $conn.Open()
        Write-Host "=== Connected to localhost:$p. Database: $($conn.Database) ==="
        
        $cmd = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdCommand("SELECT [MEASURE_NAME], [EXPRESSION] FROM `$SYSTEM.MDSCHEMA_MEASURES", $conn)
        $adapter = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd)
        $ds = New-Object System.Data.DataSet
        $adapter.Fill($ds) | Out-Null
        
        Write-Host "Total measures: $($ds.Tables[0].Rows.Count)"
        $matched = $ds.Tables[0] | Where-Object { $_.MEASURE_NAME -match "VAREJO|REG|DISTRIB|EMPRESA|PROJETADO|REALIZADO" }
        $matched | Select-Object MEASURE_NAME, EXPRESSION | Format-Table -Wrap
        
        $conn.Close()
    } catch {
        Write-Host "Port $p error: $_"
    }
}
