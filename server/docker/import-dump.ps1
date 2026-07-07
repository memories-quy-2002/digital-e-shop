param(
    [string]$ContainerName = "digitale-mysql",
    [string]$Password = "digital_e_root",
    [string]$Database = "defaultdb",
    [string]$DumpPath = "src/database/migrations/defaultdb_2026-06-01_142319.sql"
)

$dumpFile = Join-Path $PSScriptRoot ".." $DumpPath

if (-not (Test-Path $dumpFile)) {
    Write-Error "Dump file not found: $dumpFile"
    exit 1
}

Write-Host "Importing $dumpFile into $Database on container $ContainerName ..."

Get-Content $dumpFile | Where-Object { $_ -notmatch "GTID_PURGED" } | docker exec -i $ContainerName mysql -uroot -p$Password $Database

if ($LASTEXITCODE -eq 0) {
    Write-Host "Import complete."
} else {
    Write-Error "Import failed."
    exit $LASTEXITCODE
}
