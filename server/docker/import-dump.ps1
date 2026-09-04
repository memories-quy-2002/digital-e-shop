param(
    [string]$HostAddr = "localhost",
    [string]$Port = "3307",
    [string]$User = "root",
    [string]$Password = "digital_e_root",
    [string]$Database = "defaultdb",
    [string]$DumpPath = "src/database/migrations/defaultdb_2026-06-01_142319.sql"
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Split-Path -Parent $scriptDir
$dumpFile = Join-Path $serverDir $DumpPath

if (-not (Test-Path $dumpFile)) {
    Write-Error "Dump file not found: $dumpFile"
    exit 1
}

Write-Host "Importing into $Database on $HostAddr`:$Port ..."

$code = @"
const fs = require('fs');
const mysql = require('mysql2/promise');
(async () => {
    let dump = fs.readFileSync('$($dumpFile -replace '\\', '\\\\')', 'utf8');
    dump = dump.replace(/SET @@GLOBAL\\.GTID_PURGED=.*?;\\s*\\n/s, '');
    dump = 'USE $Database;\\n' + dump;
    const c = await mysql.createConnection({
        host: '$HostAddr',
        port: $Port,
        user: '$User',
        password: '$Password',
        multipleStatements: true,
    });
    await c.query(dump);
    console.log('Import complete');
    await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
"@

$scriptFile = Join-Path $env:TEMP "digitale-import.js"
$code | Set-Content -LiteralPath $scriptFile -Encoding UTF8

Push-Location $serverDir
try {
    node $scriptFile
    Remove-Item $scriptFile -Force -ErrorAction SilentlyContinue
} catch {
    Remove-Item $scriptFile -Force -ErrorAction SilentlyContinue
    throw
} finally {
    Pop-Location
}
