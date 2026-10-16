# The old script wrote credentials to the current context/default namespace.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'check-local-cluster.ps1')
Assert-3PLocalCluster
throw @'
Aplicacao automatica de credenciais do auth-service desativada.
O fluxo antigo nao conferia contexto, namespace, propriedade nem diff.
Use system/infrastructure/local/README.md para Operator API/Web.
Para auth-service, prepare uma revisao separada em namespace dedicado,
incluindo configuracao de banco, Secret completo e migracoes desativadas.
Nenhum recurso foi alterado.
'@
