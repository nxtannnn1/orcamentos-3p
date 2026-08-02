# Automação Inteligente de Processamento de Orçamentos

## O que é?

Um sistema de automação que transforma orçamentos de fornecedores, recebidos em PDF, em dados estruturados, confiáveis e prontos para análise — sem digitação manual.

## Qual problema resolve?

Orçamentos de fornecedores chegam em PDF, muitas vezes escaneados, com layouts variados e campos fiscais complexos (ICMS, IPI, PIS/COFINS, ISS). Extrair e conferir esses dados manualmente é lento e sujeito a erro. O sistema elimina esse retrabalho, extraindo os dados de forma **literal** (sem inferência) e com fidelidade ao documento original, mantendo histórico de preços e rastreabilidade de todos os arquivos processados.

## Como funciona?

```
PDF → OCR → IA → JSON estruturado → Validação → SharePoint → Histórico → Dashboards
```

O documento passa por OCR (com reconstrução inteligente de texto malformado), depois por um modelo de IA que extrai os dados em JSON estruturado e determinístico (temperatura 0). Três workflows independentes no n8n — **Orçamentos**, **Itens** e **Tributos** — processam esse JSON com lógica de UPSERT (POST/PATCH) e persistem os dados em listas do SharePoint, com validação humana antes da gravação definitiva. Os dados alimentam então dashboards de acompanhamento.

## Quais tecnologias usa?

- **n8n** — orquestração dos workflows
- **OCR** — extração de texto de PDFs escaneados
- **GPT-5.5 (API OpenAI)** — extração estruturada dos dados
- **Microsoft Graph + SharePoint** — persistência dos dados
- **Dashboards** — visualização e acompanhamento
- *(Futuro)* Banco de dados dedicado (PostgreSQL, SQL Server, MySQL ou Azure SQL), para quando o volume justificar migração do SharePoint
