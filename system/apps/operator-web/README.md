# Operator Web — Sistema 3P

Frontend operacional do MVP para revisão humana de materiais em orçamentos.

Nesta etapa, todos os dados são fictícios e persistidos apenas em memória. A UI depende da interface `OperatorRepository`, sem conhecer Microsoft Graph, SharePoint, Entra ID ou o `auth-service`.

## Execução local

```powershell
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## Validação

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```
