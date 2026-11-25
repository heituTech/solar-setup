# Start mysqld completely in the background (no window, no blocking).
# Designed for the local D:\mysql installation on this machine.
# Registered as `npm run db:start` in package.json.

$mysqlBin = "D:\mysql\bin\mysqld.exe"
$mysqlIni = "D:\mysql\my.ini"
$mysqlAdmin = "D:\mysql\bin\mysqladmin.exe"

# Already running?
& $mysqlAdmin -u root --protocol=TCP -h 127.0.0.1 ping *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "MySQL is already running on 127.0.0.1:3306"
  exit 0
}

if (-not (Test-Path $mysqlBin)) {
  Write-Error "mysqld.exe not found at $mysqlBin"
  exit 1
}

Write-Host "Starting MySQL in background..."
Start-Process -FilePath $mysqlBin -ArgumentList "--defaults-file=$mysqlIni" -WindowStyle Hidden

# Wait for port 3306 to listen
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  & $mysqlAdmin -u root --protocol=TCP -h 127.0.0.1 ping *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "MySQL is ready: 127.0.0.1:3306"
    exit 0
  }
  Start-Sleep -Milliseconds 500
}

Write-Error "MySQL failed to start within 30s. Check D:\mysql\data\mysql-error.log"
exit 1
