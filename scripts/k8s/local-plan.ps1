$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'check-local-cluster.ps1')
Assert-3PLocalCluster
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$overlay = Join-Path $repo 'system/infrastructure/k8s/local'
$namespace = 'sistema-3p-local'
& kubectl --context docker-desktop get namespace $namespace --ignore-not-found
if ($LASTEXITCODE -ne 0) { throw 'Falha ao inspecionar namespace.' }
& kubectl --context docker-desktop get deployments,services,configmaps,pvc -n $namespace --show-labels
if ($LASTEXITCODE -ne 0) { throw 'Falha ao inspecionar recursos.' }
$savedPath = $env:PATH
try {
    if (-not (Get-Command diff.exe -ErrorAction SilentlyContinue)) {
        $gitDiffDirectory = Join-Path $env:ProgramFiles 'Git/usr/bin'
        if (-not (Test-Path (Join-Path $gitDiffDirectory 'diff.exe'))) { throw 'diff.exe ausente; instale/configure manualmente antes de revisar o plano.' }
        $env:PATH = "$gitDiffDirectory;$env:PATH"
    }
    & kubectl --context docker-desktop diff -k $overlay
    if ($LASTEXITCODE -gt 1) { throw 'Falha no diff; nenhuma aplicacao realizada.' }
} finally { $env:PATH = $savedPath }
Write-Host 'Plano somente leitura. Confira propriedade, Secrets, TLS e imagens antes de aplicar.'
