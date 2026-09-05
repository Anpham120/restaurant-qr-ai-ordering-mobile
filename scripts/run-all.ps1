# Chạy cả hệ thống tại máy (Windows).
#
#   scripts\run-all.ps1              # native: JVM + uvicorn + Vite dev server, có hot reload
#   scripts\run-all.ps1 -Docker      # dựng nguyên stack bằng Docker Compose
#
# Chế độ -Docker cần deploy\.env:
#
#   Copy-Item deploy\env\local.example.env deploy\.env
#
# Chế độ native cần một PostgreSQL đang chạy sẵn; nó KHÔNG tự dựng cơ sở dữ liệu.
param(
    [switch]$Docker,
    [switch]$Install,
    [string]$EnvFile = "deploy/.env"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Import-DotEnv([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) { continue }
        $parts = $trimmed.Split("=", 2)
        [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
    }
}

if ($Docker) {
    $resolvedEnv = Join-Path $root $EnvFile
    if (-not (Test-Path -LiteralPath $resolvedEnv)) {
        throw "Thiếu $EnvFile. Chạy: Copy-Item deploy\env\local.example.env deploy\.env"
    }
    $compose = Join-Path $root "deploy/docker-compose.java.yml"
    # Migrate là bước RIÊNG, chạy xong mới tới API — giữ nguyên tắc V10 của bản .NET.
    & docker compose --env-file $resolvedEnv -f $compose --profile migrate run --rm migrate
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & docker compose --env-file $resolvedEnv -f $compose up --build
    exit $LASTEXITCODE
}

Import-DotEnv (Join-Path $root "backend-java/.env")
Import-DotEnv (Join-Path $root "ai/.env")
Import-DotEnv (Join-Path $root "frontend/.env")

# Spring đọc SPRING_DATASOURCE_*; dựng từ các biến DB_* rời cho ai quen đặt kiểu đó.
if (-not $env:SPRING_DATASOURCE_URL) {
    $hostName = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
    $port = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
    $database = if ($env:DB_NAME) { $env:DB_NAME } else { "restaurant_qr" }
    $env:SPRING_DATASOURCE_URL = "jdbc:postgresql://${hostName}:${port}/${database}"
}
if (-not $env:SPRING_DATASOURCE_USERNAME) {
    $env:SPRING_DATASOURCE_USERNAME = if ($env:DB_USERNAME) { $env:DB_USERNAME } else { "restaurant_user" }
}
if (-not $env:SPRING_DATASOURCE_PASSWORD -and $env:DB_PASSWORD) {
    $env:SPRING_DATASOURCE_PASSWORD = $env:DB_PASSWORD
}
if (-not $env:BACKEND_JAVA_PORT) { $env:BACKEND_JAVA_PORT = "8081" }
if (-not $env:CORS_ALLOWED_ORIGINS) {
    $env:CORS_ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:5177"
}

if (-not $env:JWT_SIGNING_KEY -or $env:JWT_SIGNING_KEY.Length -lt 32) {
    throw "Đặt JWT_SIGNING_KEY (từ 32 ký tự ngẫu nhiên trở lên) trong backend-java\.env"
}

if ($Install -or -not (Test-Path (Join-Path $root "frontend/node_modules"))) {
    & npm.cmd ci --prefix (Join-Path $root "frontend")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$processes = @()
try {
    # gradlew bootRun: biên dịch lại khi mã đổi, đúng thứ cần khi đang sửa.
    # Wrapper nằm trong `backend-java/`, không ở gốc kho.
    $gradlew = Join-Path $root "backend-java/gradlew.bat"
    $processes += Start-Process $gradlew -ArgumentList @("bootRun") -WorkingDirectory (Join-Path $root "backend-java") -NoNewWindow -PassThru
    foreach ($portal in @("customer", "ordering", "ops")) {
        $processes += Start-Process npm.cmd -ArgumentList @("run", "dev:$portal") -WorkingDirectory (Join-Path $root "frontend") -NoNewWindow -PassThru
    }

    Write-Host "Đã chạy: API Java (:$($env:BACKEND_JAVA_PORT)) và ba giao diện. Ctrl+C để dừng."
    while ($true) {
        Start-Sleep -Seconds 1
        $failed = $processes | Where-Object { $_.HasExited }
        if ($failed) { throw "Một tiến trình đã thoát với mã $($failed[0].ExitCode)." }
    }
}
finally {
    foreach ($process in $processes) {
        if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    }
}
