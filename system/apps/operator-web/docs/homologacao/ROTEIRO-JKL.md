# Aceite isolado J/K/L — execução ainda não autorizada

Este roteiro prepara o teste; não cria site, listas, usuários, registros,
conexões ou fluxo. Não executar em produção nem substituir IDs de modo parcial.
Resolver primeiro os bloqueios em ../ETAPAS-JKL.md. Todos os dados abaixo são
sintéticos e permanecem somente nos artefatos locais até autorização externa.

## Pré-requisitos e revisão

1. Registrar autorização para site terminando em -homolog, quatro listas isoladas,
   usuários humanos de teste e conexões exclusivas. Conferir todas as URLs, IDs,
   lookups, ações HTTP e referências de conexão. A origem e o Redis também devem
   ser de homologação. Nenhuma referência produtiva pode permanecer.
2. Comparar lists.templates.json com os metadados efetivos. Revisar Choice Familia
   e Status_Revisao; aprovar colunas OID/UUID no item e histórico. Não importar um
   template divergente como se fosse uma cópia fiel da lista atual.
3. Revisar token/concessões: nenhuma role Graph ampla aceita para write; somente
   permissões selecionadas e concessões de lista necessárias, com validação de
   permissions. Qualquer ajuste depende da TI, não deste roteiro automatizado.
4. Homologar o resolvedor Pessoa usando fonte autorizada, identidade Entra da
   sessão e ID existente no site. Testar ausente, ambíguo, tenant errado e vínculo
   divergente. Não predefinir usuário sintético como se fosse pessoa real.
5. Configurar HTTPS/callback, sessão e Redis autoritativo. Testar login, perfil
   Consulta, MFA efetiva, expiração/logout e falha Redis antes de liberar escrita.
6. Criar/importar apenas a cópia desativada do fluxo após autorização. Verificar
   parâmetros reais do conector, Pessoa/Claims, Choice/Value, expressões,
   dependências runAfter, ETags e campos de snapshot no motor Microsoft.
   Manter engineValidated=false até obter evidência real de execução correta.

## Cenário mínimo: duas ofertas do mesmo material

Usar fixtures.synthetic.json e vincular apenas IDs retornados das listas isoladas.
As duas ofertas começam PENDENTE e Enviado_Historico=NAO. Não fabricar autoria,
data ou UUID. A associação e a aprovação devem ocorrer pela sessão de um humano
de teste autorizado, após escolha explícita do mesmo material oficial.

| Origem | Item | Fornecedor sintético | Quantidade | Unidade | Unitário | Total |
|---|---|---|---:|---|---:|---:|
| TEST-B1 | TEST-I1 | Synthetic A | 2 | UN | 10 | 20 |
| TEST-B2 | TEST-I2 | Synthetic B | 2 | UN | 8 | 16 |

Material compartilhado: fixture material, Title=SYNTHETIC LABEL,
Codigo_Neoenergia=TEST-NE-1. Title é rótulo, não código interno inventado.
Datas do orçamento: 01/10/2026 e 02/10/2026, conforme fixtures. Não substituir
pela data atual nem inferir uma política de validade de preços.

## Conferência e aprovação

1. Entrar como Operador/Comprador autorizado e verificar nome/perfil no cabeçalho.
2. Abrir cada orçamento e conferir descrição, fornecedor do item, quantidade,
   unidade, unitário e total. Dado ausente/inválido impede aprovação. Correções
   devem seguir o procedimento autorizado da origem; o Operator não edita os
   campos extraídos neste contrato.
3. Selecionar o material oficial; confirmar o resumo antes de enviar. Verificar
   apenas um PATCH, ETag específico e os campos decisão/material/Pessoa/data/OID/
   UUID no mesmo registro. Não alterar Material_Sugerido_Ref.
4. Conferir intenção e resultado da auditoria pelo mesmo UUID. Recarregar e
   comparar o estado persistido. Testar rejeição em item sintético separado.
5. Simular concorrência, clique duplo e expiração. Exigir 409/401/403 corretos,
   nenhuma gravação silenciosa e nenhuma repetição automática.
6. Simular falha antes da intenção: nenhum PATCH. Simular timeout após PATCH ou
   falha de resultado de auditoria: bloquear nova decisão, reler item e reconciliar
   pelo UUID antes de nova tentativa autorizada. Não presumir que falhou a gravação.

## Histórico e comparação

1. Ativar somente a cópia isolada autorizada e acionar pelo item sintético aprovado.
   O gatilho relê o item atual e confere estado, tipos, autor, material/orçamento,
   unidade e versões. Não promover pendente/sugestão a aprovação.
2. Verificar um histórico por item, incluindo Preco_Total preservado, fornecedor,
   quantidade/unidade, três vínculos, data original de aprovação, Pessoa, OID e UUID.
3. Confirmar por releitura todo o snapshot antes de marcar Enviado_Historico=SIM.
   A confirmação deve usar ETag específico do item, sem curinga.
4. Repetir evento: continuar com um histórico por item. Histórico parcial,
   divergente ou múltiplo exige reconciliação, sem sobrescrita ou novo histórico.
5. Simular timeout na criação: consultar ID_Item_Importado, Chave_Historico e
   Item_OrigemId antes de qualquer nova tentativa autorizada. Retry automático de
   criação/confirmacão continua desativado.
6. Abrir a comparação pelo mesmo material oficial: duas ofertas elegíveis,
   fornecedores distintos, preço mínimo 8 e seleção manual temporária. Para
   quantidade 2, totais estimados 16 ou 20. Não gravar cesta/pedido automaticamente.
7. Testar unidade incompatível, orçamento ausente, preço inválido, ausência de
   ofertas e falha Graph. Não completar fornecedor pelo cabeçalho nem cair em mock.

## Evidência, aprovação final e rollback

Registrar IDs isolados, UUID da decisão, ETags, execução do fluxo, leitura do
histórico, estado de envio e resultados de comparação em armazenamento aprovado.
Não exportar dados pessoais/segredos para este repositório. A tela mostra a última
decisão registrada; histórico completo de decisões ainda é uma pendência própria.

Somente após esse aceite declarar as capacidades efetivamente homologadas.
Testes sintéticos locais e build não são aceite do MVP operacional.
Rollback: desativar a cópia do fluxo e parar apenas recursos isolados autorizados.
Preservar evidências e registros; não excluir listas, volumes ou bancos.
