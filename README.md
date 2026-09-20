# Automação Inteligente de Processamento de Orçamentos

Sistema de automação para processamento, estruturação e rastreabilidade de orçamentos de fornecedores recebidos em PDF.

## O que é?

O sistema transforma orçamentos recebidos em PDF em **dados estruturados, validados e prontos para análise**, reduzindo a necessidade de digitação e conferência manual.

A solução combina OCR, inteligência artificial, automação de workflows e integração com o ecossistema Microsoft para processar os documentos e manter histórico e rastreabilidade.

## Qual problema resolve?

Orçamentos de fornecedores podem chegar em PDF, inclusive documentos escaneados, com layouts variados e informações fiscais como ICMS, IPI, PIS/COFINS e ISS.

A extração e conferência manual desses dados:

* consome tempo;
* está sujeita a erros de transcrição;
* dificulta a padronização das informações;
* reduz a rastreabilidade do histórico de preços.

O sistema busca automatizar esse processo mantendo os dados **fiéis ao documento de origem**, sem inferência de informações ausentes, e preservando o histórico dos dados processados.

## Como funciona?

```text
PDF
 ↓
OCR
 ↓
IA
 ↓
JSON estruturado
 ↓
Validação
 ↓
SharePoint
 ↓
Histórico
 ↓
Dashboards
```

O documento passa inicialmente por OCR, incluindo etapas de reconstrução e tratamento de texto quando necessário.

Em seguida, um modelo de IA realiza a extração dos dados para um **JSON estruturado**, seguindo regras definidas pelo sistema e sem inferir informações que não estejam presentes no documento.

O processamento é dividido em três workflows independentes no **n8n**:

* **Orçamentos** — processamento dos dados gerais do orçamento;
* **Itens** — extração e associação dos materiais e serviços;
* **Tributos** — processamento das informações tributárias.

Após a extração, os dados passam por validações e são persistidos no SharePoint utilizando operações de **UPSERT (POST/PATCH)**.

O processo mantém histórico e rastreabilidade dos registros e arquivos processados. Os dados consolidados podem então ser utilizados em dashboards para acompanhamento e análise.

## Arquitetura atual

```text
                    ┌──────────────┐
                    │     PDF      │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │     OCR      │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │      IA      │
                    └──────┬───────┘
                           ↓
                 ┌────────────────────┐
                 │ JSON estruturado   │
                 └─────────┬──────────┘
                           ↓
                    ┌──────────────┐
                    │  Validação   │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │  SharePoint  │
                    └──────┬───────┘
                           ↓
                 ┌────────────────────┐
                 │ Histórico / Dados  │
                 └─────────┬──────────┘
                           ↓
                    ┌──────────────┐
                    │  Dashboards  │
                    └──────────────┘
```

## Tecnologias

* **n8n** — orquestração dos workflows e integração entre serviços;
* **OCR** — extração de texto de documentos PDF, incluindo documentos escaneados;
* **GPT-5.5 (OpenAI API)** — extração estruturada das informações;
* **Microsoft Graph + SharePoint** — persistência e gerenciamento dos dados;
* **Dashboards** — visualização e acompanhamento das informações processadas.

### Futuro

* **Banco de dados dedicado** — PostgreSQL, SQL Server, MySQL ou Azure SQL, conforme volume, requisitos de desempenho e evolução da arquitetura.

## Princípios

* **Fidelidade ao documento** — informações são extraídas conforme apresentadas na fonte;
* **Sem inferência** — informações ausentes não devem ser inventadas pelo sistema;
* **Rastreabilidade** — registros e documentos processados devem permanecer vinculados ao seu histórico;
* **Validação** — dados extraídos passam por validações antes da persistência definitiva;
* **Automação** — reduzir tarefas manuais repetitivas sem eliminar pontos necessários de supervisão humana.
