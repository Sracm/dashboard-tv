$dllPath = "C:\Program Files\Microsoft Power BI Desktop\bin\Microsoft.PowerBI.AdomdClient.dll"
[System.Reflection.Assembly]::LoadFrom($dllPath) | Out-Null

$p = 49689
$cs = "Data Source=localhost:$p;"
$conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($cs)
$conn.Open()

# Columns of CALENDARIO
$cmd = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdCommand("SELECT [TABLE_NAME], [COLUMN_NAME] FROM `$SYSTEM.DBSCHEMA_COLUMNS WHERE [TABLE_NAME] = '`$CALENDARIO' OR [TABLE_NAME] = '`$BASE SETORES'", $conn)
$ad = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd)
$ds = New-Object System.Data.DataSet
$ad.Fill($ds) | Out-Null
$ds.Tables[0] | Format-Table -AutoSize | Out-String | Set-Content "pbi_cols.txt" -Encoding utf8

# Also distinct values of CALENDARIO
$dax = "EVALUATE TOPN(20, 'CALENDARIO')"
$cmd2 = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdCommand($dax, $conn)
$ad2 = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd2)
$ds2 = New-Object System.Data.DataSet
$ad2.Fill($ds2) | Out-Null
$ds2.Tables[0] | Format-Table -AutoSize | Out-String | Add-Content "pbi_cols.txt" -Encoding utf8

$conn.Close()
Write-Output "Done"
