$ports = @(49686, 49689)
foreach ($p in $ports) {
    try {
        $connStr = "Provider=MSOLAP;Data Source=localhost:$p;"
        $conn = New-Object System.Data.OleDb.OleDbConnection($connStr)
        $conn.Open()
        Write-Host "=== PORT $p CONNECTED ==="
        
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "SELECT [CATALOG_NAME] FROM `$SYSTEM.DBSCHEMA_CATALOGS"
        $adapter = New-Object System.Data.OleDb.OleDbDataAdapter($cmd)
        $ds = New-Object System.Data.DataSet
        $adapter.Fill($ds) | Out-Null
        $cat = $ds.Tables[0].Rows[0]["CATALOG_NAME"]
        Write-Host "Catalog Name: $cat"
        
        $conn.ChangeDatabase($cat)
        
        $cmd2 = $conn.CreateCommand()
        $cmd2.CommandText = "SELECT [MEASURE_NAME], [EXPRESSION] FROM `$SYSTEM.MDSCHEMA_MEASURES WHERE [MEASURE_NAME] LIKE '%VAREJO%' OR [MEASURE_NAME] LIKE '%REALIZADO%' OR [MEASURE_NAME] LIKE '%PROJETADO%' OR [MEASURE_NAME] LIKE '%META%' OR [MEASURE_NAME] LIKE '%REG%'"
        $adapter2 = New-Object System.Data.OleDb.OleDbDataAdapter($cmd2)
        $ds2 = New-Object System.Data.DataSet
        $adapter2.Fill($ds2) | Out-Null
        Write-Host "Measures found:"
        $ds2.Tables[0] | Format-Table -Wrap
        
        $conn.Close()
    } catch {
        Write-Host "Port $p error: $_"
    }
}
