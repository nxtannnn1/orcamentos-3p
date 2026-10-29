// Politica de seguranca offline dos artefatos n8n. Nao acessa rede, n8n publicado ou credenciais.
// Uso (raiz do repositorio): node scripts/n8n/check-policy.mjs [--baseline-candidate]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  SCRIPTS_DIR,
  WORKFLOW_DIR,
  compareWithBaseline,
  fingerprint,
  formatFinding,
  looksLikeN8nWorkflow,
  textFindings,
  textRules,
  trackedPathAllowed,
  workflowFindings
} from './workflow-policy.mjs';

export const BASELINE_FILE = `${SCRIPTS_DIR}policy-baseline.json`;

// Arquivos rastreados e novos (nao ignorados): arquivos ainda nao adicionados tambem sao avaliados localmente.
export function listFiles(root) {
  const output = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  return [...new Set(output.split('\0').filter(Boolean))].filter((file) => fs.existsSync(path.join(root, file)));
}

// Caminho so e exibido quando ele proprio nao carrega um identificador.
function displayPath(file) {
  return /^[A-Za-z0-9._/-]+$/.test(file) && !textRules(file).length ? file : '<caminho omitido>';
}

export function evaluate(root, files) {
  const findings = [];
  const errors = [];
  for (const file of files) {
    const inScope = file.startsWith(WORKFLOW_DIR) || file.startsWith(SCRIPTS_DIR);
    if (inScope && !trackedPathAllowed(file)) {
      findings.push({ file: displayPath(file), rule: 'N8N_TRACKED_PATH', path: '', fingerprint: fingerprint(file, 'N8N_TRACKED_PATH', '', '') });
    }
    if (file === BASELINE_FILE) continue;

    if (file.endsWith('.json')) {
      let parsed;
      try {
        parsed = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^﻿/, ''));
      } catch {
        if (inScope) errors.push(`${displayPath(file)}: JSON invalido`);
        continue;
      }
      if (file.startsWith(WORKFLOW_DIR)) {
        findings.push(...workflowFindings(parsed, file));
      } else if (looksLikeN8nWorkflow(parsed)) {
        // Export n8n fora da pasta sanitizada escaparia do validador e da politica.
        findings.push({ file: displayPath(file), rule: 'N8N_MISPLACED_EXPORT', path: '', fingerprint: fingerprint(file, 'N8N_MISPLACED_EXPORT', '', '') });
      } else if (inScope) {
        findings.push(...textFindings(JSON.stringify(parsed, null, 1), file));
      }
    } else if (inScope && /\.(?:mjs|js|md|txt|ya?ml)$/i.test(file)) {
      findings.push(...textFindings(fs.readFileSync(path.join(root, file), 'utf8'), file));
    }
  }
  return { findings, errors };
}

export function loadBaseline(root) {
  const parsed = JSON.parse(fs.readFileSync(path.join(root, BASELINE_FILE), 'utf8'));
  if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) throw Error('baseline com formato invalido');
  for (const entry of parsed.entries) {
    if (!/^[0-9a-f]{16}$/.test(entry?.fingerprint ?? '') || typeof entry.rule !== 'string' || typeof entry.file !== 'string') {
      throw Error('entrada de baseline invalida');
    }
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  const { findings, errors } = evaluate(root, listFiles(root));

  if (process.argv.includes('--baseline-candidate')) {
    // Apenas para revisao humana de divida legada; nunca usar para silenciar um achado novo.
    const entries = findings
      .map(({ file, rule, path: where, fingerprint: id }) => ({ file, rule, path: where, fingerprint: id }))
      .sort((a, b) => `${a.file}${a.rule}${a.path}`.localeCompare(`${b.file}${b.rule}${b.path}`));
    console.log(JSON.stringify({ version: 1, entries }, null, 2));
    process.exit(0);
  }

  const { unexpected, stale } = compareWithBaseline(findings, loadBaseline(root));
  for (const error of errors) console.error(`ERRO ${error}`);
  for (const finding of unexpected) console.error(`ERRO ${formatFinding(finding)}`);
  for (const entry of stale) console.error(`ERRO baseline obsoleto (remova a entrada): ${formatFinding(entry)}`);
  const legacy = findings.length - unexpected.length;
  console.log(`Politica n8n: ${errors.length + unexpected.length + stale.length} erro(s); ${legacy} achado(s) legado(s) registrados no baseline.`);
  process.exitCode = errors.length || unexpected.length || stale.length ? 1 : 0;
}
