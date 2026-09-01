import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflowDir = path.join(root, 'system', 'automation', 'n8n');
const schemaDir = path.join(root, 'system', 'infrastructure', 'microsoft-lists');
const errors = [];
const warnings = [];

function walk(dir, predicate) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name === 'backups') return [];
    return entry.isDirectory() ? walk(full, predicate) : predicate(full) ? [full] : [];
  });
}

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(root, file)}: JSON invalido (${error.message})`);
    return null;
  }
}

const schemaFields = new Set();
for (const file of walk(schemaDir, (name) => name.endsWith('.schema.json'))) {
  const schema = loadJson(file);
  for (const field of schema?.fields ?? []) schemaFields.add(field.InternalName);
}

for (const file of walk(workflowDir, (name) => name.endsWith('.json'))) {
  const parsed = loadJson(file);
  if (!parsed) continue;
  const workflows = Array.isArray(parsed) ? parsed : [parsed];

  for (const workflow of workflows) {
    const label = `${path.basename(file)} (${workflow.name ?? 'sem nome'})`;
    const nodes = workflow.nodes ?? [];
    const names = new Set(nodes.map((node) => node.name));

    if (names.size !== nodes.length) errors.push(`${label}: nomes de nodes duplicados`);

    for (const [source, outputs] of Object.entries(workflow.connections ?? {})) {
      if (!names.has(source)) errors.push(`${label}: conexao parte de node inexistente: ${source}`);
      for (const channels of Object.values(outputs ?? {})) {
        for (const channel of channels ?? []) {
          for (const edge of channel ?? []) {
            if (!names.has(edge.node)) errors.push(`${label}: conexao aponta para node inexistente: ${edge.node}`);
          }
        }
      }
    }

    const text = JSON.stringify(workflow);
    const nodeRefs = [...text.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
    for (const ref of new Set(nodeRefs)) {
      if (!names.has(ref)) errors.push(`${label}: expressao referencia node inexistente: ${ref}`);
    }

    for (const node of nodes) {
      const code = node.parameters?.jsCode;
      if (typeof code === 'string') {
        try {
          new Function(code);
        } catch (error) {
          errors.push(`${label}: JavaScript invalido em ${node.name}: ${error.message}`);
        }
      }

      const body = node.parameters?.jsonBody;
      if (typeof body === 'string' && /password|client_secret|access_token/i.test(body)) {
        errors.push(`${label}: possivel secret em body do node ${node.name}`);
      }
    }

    const contratosInternos = new Set(['Codigo_SAP_NE', 'Codigo_SAP_EKT', 'Codigo_SAP_NDB', 'Status_Entrada']);
    for (const match of text.matchAll(/\b(?:fields\.)?([A-Z][A-Za-z0-9_]+)(?:LookupId)?\b/g)) {
      const candidate = match[1];
      if (/\d$/.test(candidate) || contratosInternos.has(candidate)) continue;
      if (candidate.includes('_') && !schemaFields.has(candidate) && !schemaFields.has(candidate.replace(/LookupId$/, ''))) {
        // Campos de contrato interno sao esperados; apenas sinalizamos nomes tipicos de persistencia.
        if (/^(Codigo|Material|Status|Observacao|Drive|Preco|Quantidade|Numero|Fornecedor|Enviado|NCM|Title)/.test(candidate)) {
          warnings.push(`${label}: conferir campo/contrato nao encontrado nos schemas: ${candidate}`);
        }
      }
    }
  }
}

for (const warning of [...new Set(warnings)].sort()) console.warn(`WARN ${warning}`);
for (const error of errors) console.error(`ERRO ${error}`);
console.log(`Validacao n8n: ${errors.length} erro(s), ${new Set(warnings).size} aviso(s).`);
process.exitCode = errors.length ? 1 : 0;
