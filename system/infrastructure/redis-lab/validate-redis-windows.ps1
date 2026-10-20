[CmdletBinding()]
param(
    [string]$GatewayEnvFile = $env:THREEP_REDIS_GATEWAY_ENV_FILE,
    [string]$CaFile = $env:THREEP_REDIS_CA_FILE,
    [string]$ReportPath = (Join-Path $PWD 'redis-validation-report.json'),
    [switch]$UseContainerCredential,
    [switch]$AuthorizeRedisRestart
)
# No build/up/down, flush, deletion of volumes, configuration change or deployment.
# Restart is optional, explicit, limited to the existing lab Redis with its volume.
$ErrorActionPreference = 'Stop'
$rows = [System.Collections.Generic.List[object]]::new()
function Result([string]$Name, [string]$Status) {
    $rows.Add([pscustomobject]@{ name = $Name; status = $Status })
    Write-Host "$Status $Name"
}
function RunNode([string]$Name, [string[]]$Arguments) {
    & node @Arguments *> $null
    Result $Name $(if ($LASTEXITCODE -eq 0) { 'PASS' } else { 'FAIL' })
    return ($LASTEXITCODE -eq 0)
}
$oldEnvFile = $env:THREEP_REDIS_GATEWAY_ENV_FILE
$oldCaFile = $env:THREEP_REDIS_CA_FILE
$oldKey = $env:THREEP_PERSISTENCE_TEST_KEY
$markerCreated = $false
$smokePath = if ($UseContainerCredential) { Join-Path $PSScriptRoot 'gateway/run-live-smoke.mjs' } else { Join-Path $PSScriptRoot 'redis-gateway-smoke.mjs' }
try {
    Get-Command docker, node -ErrorAction Stop | Out-Null
    & docker info --format '{{.ServerVersion}}' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Engine unavailable' }
    Result 'Docker-Engine' 'PASS'
    $containers = @{}
    foreach ($service in @('redis', 'gateway', 'caddy')) {
        $raw = & docker inspect "3p-redis-lab-$service-1" 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'Missing lab service' }
        $item = ($raw | ConvertFrom-Json)[0]
        if ($item.Config.Labels.'com.docker.compose.project' -ne '3p-redis-lab' -or
            $item.Config.Labels.'com.docker.compose.service' -ne $service -or !$item.State.Running) { throw 'Unexpected lab identity' }
        $containers[$service] = $item
        Result "$service-running" 'PASS'
        if ($item.State.Health) { Result "$service-healthcheck" $(if ($item.State.Health.Status -eq 'healthy') { 'PASS' } else { 'FAIL' }) }
        elseif ($service -ne 'caddy') { Result "$service-healthcheck" 'SKIP' }
    }
    $mount = @($containers.redis.Mounts | Where-Object { $_.Destination -eq '/data' -and $_.Type -eq 'volume' })
    if ($mount.Count -ne 1 -or $mount[0].Name -ne '3p-redis-lab_redis_data') { throw 'Unexpected Redis volume' }
    Result 'existing-data-volume' 'PASS'
    if (@($containers.redis.NetworkSettings.Ports.PSObject.Properties | Where-Object { $null -ne $_.Value }).Count -gt 0) { throw 'Redis published port' }
    $privateRaw = & docker network inspect '3p-redis-lab_redis_private' 2>$null
    if ($LASTEXITCODE -ne 0 -or !(($privateRaw | ConvertFrom-Json)[0].Internal)) { throw 'Redis network is not internal' }
    Result 'Redis-private-network-no-published-port' 'PASS'
    $config = & docker exec 3p-redis-lab-redis-1 redis-cli --json CONFIG GET appendonly appendfsync maxmemory-policy
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect persistence' }
    $configText = $config -join ''
    if ($configText -notmatch '"yes"' -or $configText -notmatch '"always"' -or $configText -notmatch '"noeviction"') { throw 'Unexpected persistence configuration' }
    Result 'AOF-always-noeviction' 'PASS'
    if (!$UseContainerCredential) {
        if (!$GatewayEnvFile -or !$CaFile -or !(Test-Path -LiteralPath $GatewayEnvFile) -or !(Test-Path -LiteralPath $CaFile)) { throw 'Secure token file and CA file required' }
        $env:THREEP_REDIS_GATEWAY_ENV_FILE = (Resolve-Path -LiteralPath $GatewayEnvFile).Path
        $env:THREEP_REDIS_CA_FILE = (Resolve-Path -LiteralPath $CaFile).Path
    }
    foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'gateway') -Filter '*.mjs' -File | Select-Object -ExpandProperty Name)) {
        $null = RunNode "syntax-$file" @('--check', (Join-Path $PSScriptRoot "gateway/$file"))
    }
    $null = RunNode 'syntax-HTTPS-smoke' @('--check', (Join-Path $PSScriptRoot 'redis-gateway-smoke.mjs'))
    $null = RunNode 'candidate-unit-contracts' @('--test', (Join-Path $PSScriptRoot 'gateway/gateway.test.mjs'))
    $null = RunNode 'candidate-real-Redis' @((Join-Path $PSScriptRoot 'gateway/run-real-tests.mjs'))
    & node $smokePath 2>$null | ForEach-Object {
        $smoke = $_ | ConvertFrom-Json
        foreach ($row in $smoke.results) { Result "running-HTTPS-$($row.name)" $row.status }
    }
    if ($LASTEXITCODE -ne 0) { Result 'running-gateway-smoke' 'FAIL' }
    if ($AuthorizeRedisRestart) {
        if (@($rows | Where-Object status -eq 'FAIL').Count) { throw 'Restart refused after failed prerequisite' }
        $env:THREEP_PERSISTENCE_TEST_KEY = "3p:redis-test:$([guid]::NewGuid().ToString()):persistence"
        $markerCreated = RunNode 'persistence-write' @($smokePath, 'write')
        if (!$markerCreated) { throw 'Marker not confirmed' }
        & docker restart 3p-redis-lab-redis-1 *> $null
        if ($LASTEXITCODE -ne 0) { throw 'Controlled restart failed' }
        $recovered = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            & node $smokePath read *> $null
            if ($LASTEXITCODE -eq 0) { $recovered = $true; break }
            Start-Sleep -Seconds 1
        }
        Result 'persistence-after-restart-and-recovery' $(if ($recovered) { 'PASS' } else { 'FAIL' })
    } else { Result 'persistence-after-restart-and-recovery-explicit-authorization-required' 'SKIP' }
} catch {
    # Do not copy raw external errors, config, environment or credentials to logs.
    Result 'validation-prerequisite-or-execution' 'FAIL'
} finally {
    if ($markerCreated) { $null = RunNode 'persistence-cleanup' @($smokePath, 'cleanup') }
    $env:THREEP_REDIS_GATEWAY_ENV_FILE = $oldEnvFile
    $env:THREEP_REDIS_CA_FILE = $oldCaFile
    $env:THREEP_PERSISTENCE_TEST_KEY = $oldKey
    $failed = @($rows | Where-Object status -eq 'FAIL').Count -gt 0
    $partial = @($rows | Where-Object status -eq 'SKIP').Count -gt 0
    $status = if ($failed) { 'FAIL' } elseif ($partial) { 'PARTIAL' } else { 'PASS' }
    @{ status = $status; results = @($rows.ToArray()); utc = [DateTime]::UtcNow.ToString('o') } |
        ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
}
if ($failed) { exit 1 }
if ($partial) { exit 2 }
exit 0
