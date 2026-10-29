// Politica offline dos artefatos n8n versionados. Diagnosticos nunca incluem o valor encontrado:
// apenas arquivo, regra, caminho JSON e uma impressao digital (hash truncado).
import { createHash } from 'node:crypto';

export const WORKFLOW_DIR = 'system/automation/n8n/';
export const SCRIPTS_DIR = 'scripts/n8n/';

const placeholder = /^(?:[A-Z][A-Z0-9_]*_PLACEHOLDER|EXAMPLE_[A-Z0-9_]+)$/;
const guid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const email = /[A-Z0-9._%+-]+@((?:[A-Z0-9-]+\.)+[A-Z]{2,})\b/gi;
const reservedEmailDomain = /(?:^|\.)(?:example\.(?:com|org|net)|example|invalid|test|localhost)$/i;
const tenantHost = /\b([a-z0-9-]+)(?:-my)?\.(?:sharepoint\.com|onmicrosoft\.com)\b/gi;
const url = /\bhttps?:\/\/([^/\s"'`?#\\]+)/gi;
const allowedHost = /^(?:graph\.microsoft\.com|example\.sharepoint\.com|(?:[a-z0-9-]+\.)*example\.(?:com|org|net)|[A-Z0-9_]*PLACEHOLDER[A-Z0-9_]*|EXAMPLE_[A-Z0-9_]+)$/;
const driveId = /\bb![A-Za-z0-9_-]{20,}/;
const tokenPatterns = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bBearer\s+(?!\{\{)[A-Za-z0-9._~+/-]{16,}/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bglpat-[A-Za-z0-9_-]{20,}/,
  /[?&](?:sig|access_token|refresh_token|client_secret|api_key|apikey|code)=(?!\{\{)[^&\s"'{]{8,}/i
];
const secretKey = /^(?:password|passwd|secret|client_?secret|api_?key|access_?token|refresh_?token|token|private_?key|authorization|cookie)$/i;
const secretHeader = /^(?:authorization|cookie|x-api-key|api-key|apikey|x-n8n-api-key|ocp-apim-subscription-key|token)$/i;
const guidKeys = new Set(['id', 'versionId', 'activeVersionId']);
const neutralLocatorKeys = new Set(['modelId']);
const webhookTypes = new Set(['n8n-nodes-base.webhook', 'n8n-nodes-base.formTrigger']);
const dangerousTypes = new Set(['n8n-nodes-base.executeCommand', 'n8n-nodes-base.ssh']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isExpression = (value) => typeof value === 'string' && value.startsWith('=');
const literal = (value) => value != null && value !== '' && !isExpression(value) && !placeholder.test(String(value));

export function fingerprint(file, rule, path, value) {
  return createHash('sha256').update(`${file}\0${rule}\0${path}\0${value}`).digest('hex').slice(0, 16);
}

// Achados de texto aplicaveis tanto a workflows quanto a scripts e documentos.
export function textRules(value) {
  const rules = [];
  if (tokenPatterns.some((pattern) => pattern.test(value))) rules.push('N8N_SECRET_TOKEN');
  for (const match of value.matchAll(tenantHost)) {
    if (match[1].toLowerCase() !== 'example') { rules.push('N8N_TENANT_HOST'); break; }
  }
  for (const match of value.matchAll(email)) {
    if (!reservedEmailDomain.test(match[1])) { rules.push('N8N_EMAIL'); break; }
  }
  if (driveId.test(value)) rules.push('N8N_DRIVE_ID');
  return rules;
}

function workflowList(parsed) {
  return Array.isArray(parsed) ? parsed : [parsed];
}

function label(workflow, index, count) {
  return count > 1 ? `[${index}:${workflow?.name ?? 'sem nome'}]` : '';
}

// Formas de referencia nao cobertas pelo $('X') do validador principal.
function legacyNodeRefs(text) {
  return new Set([
    ...text.matchAll(/\$node\[\\?["']([^"'\\]+)\\?["']\]/g),
    ...text.matchAll(/\$items\(\\?["']([^"'\\]+)\\?["']/g)
  ].map((match) => match[1]));
}

// Achados de seguranca e de referencia, comparados com o baseline de divida legada.
export function workflowFindings(parsed, file) {
  const findings = [];
  const list = workflowList(parsed);
  list.forEach((workflow, index) => {
    if (!isObject(workflow)) return;
    const prefix = label(workflow, index, list.length);
    const add = (rule, path, value) =>
      findings.push({ file, rule, path: `${prefix}${path}`, fingerprint: fingerprint(file, rule, `${prefix}${path}`, value) });

    if (workflow.active === true) add('N8N_ACTIVE', 'active', 'true');
    if (isObject(workflow.pinData) && Object.keys(workflow.pinData).length) add('N8N_EXECUTION_DATA', 'pinData', JSON.stringify(workflow.pinData));
    if (workflow.staticData != null && !(isObject(workflow.staticData) && !Object.keys(workflow.staticData).length)) {
      add('N8N_EXECUTION_DATA', 'staticData', JSON.stringify(workflow.staticData));
    }
    if (literal(workflow.meta?.instanceId)) add('N8N_INSTANCE_ID', 'meta.instanceId', workflow.meta.instanceId);

    const nodePath = (node, position) => `nodes[${typeof node?.name === 'string' ? node.name : position}]`;
    const nodeNames = new Set((Array.isArray(workflow.nodes) ? workflow.nodes : []).map((node) => node?.name));
    (Array.isArray(workflow.nodes) ? workflow.nodes : []).forEach((node, position) => {
      if (!isObject(node)) return;
      const base = nodePath(node, position);
      for (const ref of legacyNodeRefs(JSON.stringify(node.parameters ?? {}))) {
        if (!nodeNames.has(ref)) add('N8N_BROKEN_REFERENCE', `${base}.parameters -> ${ref}`, ref);
      }
      for (const [type, credential] of Object.entries(node.credentials ?? {})) {
        if (literal(credential?.id)) add('N8N_CREDENTIAL_ID', `${base}.credentials.${type}.id`, credential.id);
      }
      if (literal(node.webhookId)) add('N8N_WEBHOOK_ID', `${base}.webhookId`, node.webhookId);
      if (webhookTypes.has(node.type) && (node.parameters?.authentication ?? 'none') === 'none') {
        add('N8N_WEBHOOK_AUTH', `${base}.parameters.authentication`, String(node.parameters?.authentication));
      }
      if (dangerousTypes.has(node.type)) add('N8N_DANGEROUS_NODE', `${base}.type`, node.type);
      const code = node.parameters?.jsCode ?? node.parameters?.pythonCode;
      if (typeof code === 'string' && /\b(?:child_process|require\s*\(\s*['"](?:fs|net|http|https)['"]\s*\))/.test(code)) {
        add('N8N_DANGEROUS_NODE', `${base}.parameters.code`, code);
      }
    });

    // Varredura generica com caminho estavel (nodes indexados por nome, nao por posicao).
    function walk(value, path, key) {
      if (Array.isArray(value)) {
        value.forEach((entry, i) => walk(entry, path === 'nodes' && isObject(entry) ? nodePath(entry, i) : `${path}[${i}]`, key));
        return;
      }
      if (isObject(value)) {
        if (value.__rl === true && literal(value.value) && !neutralLocatorKeys.has(key)) {
          add('N8N_RESOURCE_LOCATOR', `${path}.value`, String(value.value));
        }
        if (typeof value.name === 'string' && secretHeader.test(value.name) && literal(value.value)) {
          add('N8N_SECRET_FIELD', `${path}.value`, String(value.value));
        }
        for (const [childKey, child] of Object.entries(value)) {
          if (/^(?:allowUnauthorizedCerts|ignoreSSLIssues)$/.test(childKey) && child === true) {
            add('N8N_TLS_DISABLED', `${path}.${childKey}`, 'true');
          }
          if (secretKey.test(childKey) && typeof child === 'string' && literal(child)) {
            add('N8N_SECRET_FIELD', `${path}.${childKey}`, child);
          }
          walk(child, path ? `${path}.${childKey}` : childKey, childKey);
        }
        return;
      }
      if (typeof value !== 'string') return;
      for (const rule of textRules(value)) add(rule, path, value);
      for (const match of value.matchAll(url)) {
        if (!match[1].includes('{{') && !allowedHost.test(match[1])) { add('N8N_ENDPOINT', path, value); break; }
      }
      // ids aleatorios do proprio n8n (nodes, condicoes, versoes) sao permitidos; webhookId tem regra propria.
      if (guid.test(value) && !(guidKeys.has(key) && value.length === 36) && key !== 'webhookId') {
        add('N8N_ENVIRONMENT_ID', path, value);
      }
    }
    walk(workflow, '', '');
  });
  // A mesma regra pode disparar em mais de um criterio no mesmo caminho; mantem um achado.
  return [...new Map(findings.map((finding) => [finding.fingerprint, finding])).values()];
}

export function textFindings(text, file) {
  const findings = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const rule of textRules(line)) {
      // Linha no caminho deixaria o baseline fragil; o conteudo da linha ja diferencia os achados.
      findings.push({ file, rule, path: `linha ${index + 1}`, fingerprint: fingerprint(file, rule, '', line.trim()) });
    }
  });
  return [...new Map(findings.map((finding) => [finding.fingerprint, finding])).values()];
}

export function trackedPathAllowed(file) {
  if (file.startsWith(WORKFLOW_DIR)) {
    const name = file.slice(WORKFLOW_DIR.length);
    return /^[A-Z0-9-]+\.md$/.test(name) || /^workflow-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(name);
  }
  if (file.startsWith(SCRIPTS_DIR)) {
    const name = file.slice(SCRIPTS_DIR.length);
    return /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.test)?\.mjs$/.test(name) || /^(?:README|[a-z0-9-]+)\.md$/.test(name)
      || name === 'policy-baseline.json';
  }
  return true;
}

export function looksLikeN8nWorkflow(parsed) {
  return workflowList(parsed).some((workflow) => isObject(workflow) && Array.isArray(workflow.nodes) &&
    workflow.nodes.some((node) => typeof node?.type === 'string' && /^(?:n8n-nodes-|@n8n\/)/.test(node.type)));
}

// Checagens estruturais complementares as de validate-workflows.mjs.
export function structuralErrors(parsed) {
  const errors = [];
  const list = workflowList(parsed);
  if (!list.length) return ['arquivo sem workflows'];
  list.forEach((workflow, index) => {
    const where = list.length > 1 ? `workflow ${index}: ` : '';
    if (!isObject(workflow)) { errors.push(`${where}workflow deve ser objeto`); return; }
    if (typeof workflow.name !== 'string' || !workflow.name.trim()) errors.push(`${where}nome do workflow ausente`);
    if (!Array.isArray(workflow.nodes) || !workflow.nodes.length) { errors.push(`${where}lista de nodes ausente ou vazia`); return; }
    if (!isObject(workflow.connections)) errors.push(`${where}mapa de conexoes ausente`);

    const ids = new Set();
    workflow.nodes.forEach((node, position) => {
      if (!isObject(node)) { errors.push(`${where}node ${position} deve ser objeto`); return; }
      if (typeof node.name !== 'string' || !node.name.trim()) errors.push(`${where}node ${position} sem nome`);
      if (typeof node.type !== 'string' || !node.type.trim()) errors.push(`${where}node ${node.name ?? position} sem tipo`);
      if (node.parameters !== undefined && !isObject(node.parameters)) errors.push(`${where}node ${node.name ?? position}: parameters invalido`);
      if (node.id !== undefined) {
        if (ids.has(node.id)) errors.push(`${where}id de node duplicado em ${node.name ?? position}`);
        ids.add(node.id);
      }
    });

    for (const [source, outputs] of Object.entries(isObject(workflow.connections) ? workflow.connections : {})) {
      if (!isObject(outputs)) { errors.push(`${where}conexoes de ${source} invalidas`); continue; }
      for (const [type, channels] of Object.entries(outputs)) {
        if (!Array.isArray(channels)) { errors.push(`${where}conexoes ${type} de ${source} invalidas`); continue; }
        for (const channel of channels) {
          if (channel !== null && !Array.isArray(channel)) { errors.push(`${where}canal de ${source} invalido`); continue; }
          for (const edge of channel ?? []) {
            if (!isObject(edge) || typeof edge.node !== 'string' || typeof edge.type !== 'string' ||
                !Number.isInteger(edge.index) || edge.index < 0) {
              errors.push(`${where}aresta invalida a partir de ${source}`);
            }
          }
        }
      }
    }
  });
  return errors;
}

export function compareWithBaseline(findings, baseline) {
  const known = new Map((baseline?.entries ?? []).map((entry) => [entry.fingerprint, entry]));
  const seen = new Set(findings.map((finding) => finding.fingerprint));
  return {
    unexpected: findings.filter((finding) => !known.has(finding.fingerprint)),
    stale: [...known.values()].filter((entry) => !seen.has(entry.fingerprint))
  };
}

export function formatFinding(finding) {
  return `${finding.rule} ${finding.file} ${finding.path} [${finding.fingerprint}]`;
}
