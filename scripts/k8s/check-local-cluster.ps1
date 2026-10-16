$ErrorActionPreference = 'Stop'
function Assert-3PLocalCluster {
    $current = & kubectl config current-context
    if ($LASTEXITCODE -ne 0 -or $current.Trim() -ne 'docker-desktop') {
        throw 'Selecione e verifique manualmente docker-desktop; nenhum contexto sera alterado.'
    }
    $server = & kubectl --context docker-desktop config view --minify -o 'jsonpath={.clusters[0].cluster.server}'
    if ($LASTEXITCODE -ne 0 -or $server -notmatch '^https://(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/?$') {
        throw 'Servidor Kubernetes nao confirmado como loopback.'
    }
    $nodeJson = & kubectl --context docker-desktop get nodes -o json --request-timeout=10s
    if ($LASTEXITCODE -ne 0) { throw 'Cluster local indisponivel.' }
    $nodes = $nodeJson | ConvertFrom-Json
    if (@($nodes.items).Count -ne 1 -or $nodes.items[0].metadata.name -notin @('desktop-control-plane', 'docker-desktop')) {
        throw 'Identidade dos nodes nao corresponde ao Docker Desktop local esperado.'
    }
    if (-not ($nodes.items[0].status.conditions | Where-Object { $_.type -eq 'Ready' -and $_.status -eq 'True' })) {
        throw 'Node local nao esta Ready.'
    }
}
