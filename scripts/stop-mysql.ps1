# Stop mysqld gracefully via mysqladmin shutdown.
# Registered as `npm run db:stop` in package.json.

$mysqlAdmin = "D:\mysql\bin\mysqladmin.exe"

if (-not (Test-Path $mysqlAdmin)) {
  Write-Error "mysqladmin.exe not found at $mysqlAdmin"
  exit 1
}

& $mysqlAdmin -u root --protocol=TCP -h 127.0.0.1 shutdown
if ($LASTEXITCODE -eq 0) {
  Write-Host "MySQL stopped."
} else {
  Write-Host "MySQL is not running or already stopped."
}
