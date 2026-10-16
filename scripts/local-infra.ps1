param(
    [ValidateSet('Validate', 'Build', 'Start', 'Status', 'Ready')]
    [string]$Action = 'Status'
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$compose = Join-Path $repo 'system/infrastructure/local/compose.yml'

function Invoke-Docker {
    param([string[]]$Arguments)
    & docker --context desktop-linux @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker falhou ($LASTEXITCODE)." }
}

$endpoint = & docker context inspect desktop-linux --format '{{.Endpoints.docker.Host}}'
if ($LASTEXITCODE -ne 0 -or $endpoint.Trim() -ne 'npipe:////./pipe/dockerDesktopLinuxEngine') {
    throw 'O endpoint Docker Desktop local esperado nao foi confirmado.'
}
$argsCompose = @('compose', '-f', $compose)
switch ($Action) {
    'Validate' { Invoke-Docker ($argsCompose + @('config', '--quiet')) }
    'Build' { Invoke-Docker ($argsCompose + @('config', '--quiet')); Invoke-Docker ($argsCompose + @('build', 'operator-web')) }
    'Start' {
        Invoke-Docker ($argsCompose + @('config', '--quiet'))
        Invoke-Docker ($argsCompose + @('up', '-d', '--no-deps', '--wait', '--wait-timeout', '180', 'operator-web'))
    }
    'Status' {
        Invoke-Docker ($argsCompose + @('ps'))
        Invoke-Docker @('stats', '--no-stream', '--format', '{{.Name}} | {{.CPUPerc}} | {{.MemUsage}}')
    }
    'Ready' {
        try {
            Invoke-Docker ($argsCompose + @('exec', '-T', 'operator-api', 'node', 'container-healthcheck.mjs', '--ready'))
        } catch {
            throw 'API ainda nao pronta. Confira container, API_PROBE_TOKEN, hash do cliente, TLS PostgreSQL, role de leitura e schema. Liveness healthy nao comprova integracao.'
        }
        Write-Host 'API pronta: autenticacao, TLS, role e schema verificados.'
    }
}
