param(
    [string]$OrderCount = "50",
    [string]$ReviewCount = "50"
)

$env:DB_HOST = "localhost"
$env:DB_PORT = "3307"
$env:DB_USER = "root"
$env:DB_PASSWORD = "digital_e_root"
$env:DB_NAME = "defaultdb"
$env:DATABASE_URL = "mysql://root:digital_e_root@localhost:3307/defaultdb"
$env:MOCK_ORDER_COUNT = $OrderCount
$env:MOCK_REVIEW_COUNT = $ReviewCount

$seedScript = Join-Path $PSScriptRoot ".." "src/database/seeders/seedMockOrdersReviews.js"

Write-Host "Seeding $OrderCount orders and $ReviewCount reviews..."

node $seedScript

if ($LASTEXITCODE -eq 0) {
    Write-Host "Seed complete."
} else {
    Write-Error "Seed failed."
    exit $LASTEXITCODE
}
