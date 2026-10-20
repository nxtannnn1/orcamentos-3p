# Fase M.4 — plano de homologação integrada

Estado em 20/10/2026: preparação documental; nenhum ensaio de escrita real executado.

## Portões obrigatórios

- [ ] Responsável funcional e TI aprovam ambiente, janela, operadores e escopo das escritas.
- [ ] Sessão Microsoft real, registro ativo e MFA comprovado por política/logs; sem bypass.
- [ ] Perfis humanos e permissões técnicas mínimas conferidos separadamente.
- [ ] Redis autoritativo acessível; falha impede operação, sem fallback de memória.
- [ ] Resolver Pessoa validado com sessão real e lookup local do site correto.
- [ ] Configuração, schema, nomes internos/tipos e concessões restritas aprovados.
- [ ] OID/UUID remotos e contrato de auditoria estão disponíveis e comprovados; nomes candidatos não bastam.
- [ ] Item isolado em `Itens_Importados`, orçamento aberto, sem processamento paralelo automático.
- [ ] Procedimento de incidente/recuperação, responsáveis e evidências protegidas definidos.
- [ ] Autorização específica de escrita registrada; testes locais não a substituem.

Reabertura real continua bloqueada até aprovação e implementação do ledger, marcador remoto, perfis e recuperação. Aprovar a direção funcional de autoria não autoriza criar coluna nem habilitar endpoint.

## Registro do ensaio

Em repositório restrito, registrar ambiente/versão do código/configuração aprovada, site/lista/orçamento/item, ETag e estado inicial integral necessário, UUID do ensaio e operações, operador autenticado e Pessoa resolvida. Relatório compartilhável deve pseudonimizar identidades/IDs sensíveis e omitir tokens, cookies, secrets e headers de autenticação.

Não copiar produção para fixture indiscriminadamente. Capturar leitura anterior, intenção durável, tentativa, resposta sanitizada, releitura e outcome, vinculados pelo UUID. Registrar códigos de saída e tempos. Evidências integrais ficam protegidas; hashes em relatório servem apenas para conferir integridade.

## Matriz operacional

| Cenário | Execução futura controlada | Aceite |
|---|---|---|
| Consulta/seleção | Abrir item isolado pela sessão real | IDs/estado/ETag correspondem à leitura autorizada |
| Correção | Alterar campo permitido | JSON original preservado, intenção/correção confirmadas por releitura |
| Campo indevido | Solicitação negativa preparada | Backend nega antes de PATCH |
| Aprovação | Pessoa resolvida e material válido | Status, material, Pessoa, OID, data e UUID coincidem |
| Rejeição | Justificativa válida | Identidade/data/UUID/motivo persistem, material vazio |
| Justificativa inválida | Ausente, 9 ou 2.001 caracteres | Frontend/backend negam sem escrita |
| Concorrência | Dois operadores no item e versão controlados | Uma operação vence; outra conflita sem duplicação |
| ETag antigo | Solicitar com versão anterior registrada | Conflito; não há retry |
| Duplo clique | Repetição identificável | Sem nova gravação indevida; outcome vinculado |
| Resposta perdida | Falha injetada em transporte de ensaio autorizado | Incerto, sem PATCH novo; recuperar UUID/releitura |
| Pessoa divergente | Fixture/falha controlada em adaptador de ensaio | Sem confirmação integral de aprovação |
| Auditoria indisponível antes | Falha controlada sem indisponibilizar serviço compartilhado | Zero PATCH |
| Auditoria falha depois | Simulação de falha do adaptador após possível escrita | Bloqueio, sem sucesso fictício, recuperação pelo UUID |
| Reconciliação | Administrador autorizado observa novamente | Nova evidência; intenção/outcomes antigos preservados |
| Reabertura real | **BLOQUEADA nesta fase** | Somente após os contratos e autorizações pendentes |

Não provocar indisponibilidade de Redis compartilhado nem alterar manualmente dados reais para fabricar divergência. Cenários destrutivos devem usar adaptadores de falha isolados aprovados. Qualquer alteração de dados para montar cenário também exige autorização de escrita.

## Execução, parada e recuperação

1. Conferir portões e estado inicial somente por leitura autorizada.
2. Executar um cenário por vez; suspender automações concorrentes apenas por procedimento autorizado.
3. Parar ao detectar identidade divergente, escrita fora do item permitido, pendência incerta ou falha de auditoria.
4. Não reenviar PATCH ou gerar UUID novo para contornar pendência.
5. Recuperar intenção/tentativa por UUID; reler estado completo e comparar ETag, identidade, material e conteúdo.
6. Acrescentar evidência durável com autorização administrativa. Se insuficiente, manter bloqueio e abrir incidente.
7. Restaurar/limpar dados somente por ação específica autorizada, auditada como nova operação. Não executar rollback silencioso.

## Critério de aceite e encerramento

Todas as operações concluídas devem possuir prova verificável remota e durável. Testes negativos devem demonstrar ausência de escrita ou bloqueio explícito de incerteza. A indisponibilidade de prova é falha de aceite, mesmo que a UI pareça correta.

Conferir sessão/MFA, resolvedor, schemas, UUIDs, ETags, integridade dos eventos, recuperação, ausência de credenciais em evidências e autorização dos participantes. Registrar defeitos, riscos residuais e aceite formal. Homologação aprovada ainda não autoriza produção: esta exige continuidade, observabilidade, recuperação e aprovação específica.
