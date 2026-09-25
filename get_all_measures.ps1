$dllPath = "C:\Program Files\Microsoft Power BI Desktop\bin\Microsoft.PowerBI.AdomdClient.dll"
[System.Reflection.Assembly]::LoadFrom($dllPath) | Out-Null

$p = 49689
$cs = "Data Source=localhost:$p;"
$conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($cs)
$conn.Open()

$dax = "SELECT [MEASUREGROUP_NAME], [MEASURE_NAME], [EXPRESSION], [DESCRIPTION] FROM `$SYSTEM.MDSCHEMA_MEASURES"
$cmd = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdCommand($dax, $conn)
$ad = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd)
$ds = New-Object System.Data.DataSet
$ad.Fill($ds) | Out-Null

$lines = @()
foreach ($row in $ds.Tables[0].Rows) {
    $grp = $row["MEASUREGROUP_NAME"]
    $name = $row["MEASURE_NAME"]
    $expr = $row["EXPRESSION"]
    if ($expr) {
        $lines += "[$grp] $name = $expr"
    }
}
$lines | Set-Content "pbi_all_measures_clean.txt" -Encoding utf8
Write-Output "Wrote $($lines.Count) measures to pbi_all_measures_clean.txt"

$conn.Close()
