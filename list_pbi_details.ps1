$dllPath = "C:\Program Files\Microsoft Power BI Desktop\bin\Microsoft.PowerBI.AdomdClient.dll"
[System.Reflection.Assembly]::LoadFrom($dllPath) | Out-Null

$out = @()
$ports = @(49686, 49689)
foreach ($p in $ports) {
    $cs = "Data Source=localhost:$p;"
    $conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($cs)
    $conn.Open()
    $out += "`n=================== PORT $p : $($conn.Database) ==================="
    
    # Tables
    $cmd = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdCommand("SELECT [TABLE_NAME] FROM `$SYSTEM.DBSCHEMA_TABLES WHERE [TABLE_TYPE] = 'TABLE'", $conn)
    $adapter = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd)
    $ds = New-Object System.Data.DataSet
    $adapter.Fill($ds) | Out-Null
    $out += "--- TABLES ---"
    $out += ($ds.Tables[0] | Format-Table -AutoSize | Out-String)
    
    # All Measures
    $cmd2 = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdCommand("SELECT [MEASUREGROUP_NAME], [MEASURE_NAME], [EXPRESSION] FROM `$SYSTEM.MDSCHEMA_MEASURES", $conn)
    $adapter2 = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd2)
    $ds2 = New-Object System.Data.DataSet
    $adapter2.Fill($ds2) | Out-Null
    $out += "--- ALL MEASURES ---"
    $out += ($ds2.Tables[0] | Format-Table -Wrap | Out-String)
    
    $conn.Close()
}
$out | Set-Content "pbi_details.txt" -Encoding utf8
Write-Output "Done writing pbi_details.txt"
