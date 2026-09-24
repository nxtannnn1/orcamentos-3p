$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$EnvFile = Join-Path $RepoRoot "system\services\auth-service\.env"

if (-not (Test-Path $EnvFile)) {
    throw "Arquivo .env nao encontrado: $EnvFile"
}

$envValues = @{}

Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()

    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
        $key, $value = $line -split "=", 2
        $envValues[$key.Trim()] = $value.Trim()
    }
}

$required = @(
    "MICROSOFT_TENANT_ID",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "MICROSOFT_SERVICE_CLIENT_ID",
    "MICROSOFT_SERVICE_CLIENT_SECRET",
    "N8N_API_KEY",
    "SHAREPOINT_SITE_ID",
    "SHAREPOINT_MATERIALS_LIST_ID",
    "APP_CORS_ALLOWED_ORIGINS",
    "SESSION_COOKIE_SECURE"
)

$missing = $required | Where-Object {
    -not $envValues.ContainsKey($_) -or
    [string]::IsNullOrWhiteSpace($envValues[$_])
}

if ($missing) {
    throw "Variaveis ausentes no .env: $($missing -join ', ')"
}

$configArgs = @(
    "MICROSOFT_TENANT_ID=$($envValues['MICROSOFT_TENANT_ID'])",
    "SHAREPOINT_SITE_ID=$($envValues['SHAREPOINT_SITE_ID'])",
    "SHAREPOINT_MATERIALS_LIST_ID=$($envValues['SHAREPOINT_MATERIALS_LIST_ID'])",
    "MICROSOFT_GRAPH_BASE_URL=https://graph.microsoft.com/v1.0",
    "APP_CORS_ALLOWED_ORIGINS=$($envValues['APP_CORS_ALLOWED_ORIGINS'])",
    "SESSION_COOKIE_SECURE=$($envValues['SESSION_COOKIE_SECURE'])"
)

$secretArgs = @(
    "MICROSOFT_CLIENT_ID=$($envValues['MICROSOFT_CLIENT_ID'])",
    "MICROSOFT_CLIENT_SECRET=$($envValues['MICROSOFT_CLIENT_SECRET'])",
    "MICROSOFT_SERVICE_CLIENT_ID=$($envValues['MICROSOFT_SERVICE_CLIENT_ID'])",
    "MICROSOFT_SERVICE_CLIENT_SECRET=$($envValues['MICROSOFT_SERVICE_CLIENT_SECRET'])",
    "N8N_API_KEY=$($envValues['N8N_API_KEY'])"
)

kubectl create configmap auth-service-config `
    --from-literal=$($configArgs[0]) `
    --from-literal=$($configArgs[1]) `
    --from-literal=$($configArgs[2]) `
    --from-literal=$($configArgs[3]) `
    --from-literal=$($configArgs[4]) `
    --from-literal=$($configArgs[5]) `
    --dry-run=client -o yaml |
kubectl apply -f -

kubectl create secret generic auth-service-secret `
    --from-literal=$($secretArgs[0]) `
    --from-literal=$($secretArgs[1]) `
    --from-literal=$($secretArgs[2]) `
    --from-literal=$($secretArgs[3]) `
    --from-literal=$($secretArgs[4]) `
    --dry-run=client -o yaml |
kubectl apply -f -

Write-Host "ConfigMap e Secret do auth-service aplicados com sucesso."