// Resumo de um relatorio JSON do gitleaks para logs de CI.
// Imprime apenas regra, arquivo, linha, commit e fingerprint; nunca Secret, Match ou Line, mesmo redigidos.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const safe = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '?');

export function summarize(findings) {
  const lines = findings.map((finding) =>
    `${safe(finding.RuleID)} ${safe(finding.File)}:${Number(finding.StartLine) || 0} ` +
    `commit=${safe(finding.Commit).slice(0, 12) || '-'} fingerprint=${safe(finding.Fingerprint)}`);
  return [`gitleaks: ${findings.length} achado(s).`, ...lines].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    if (!Array.isArray(report)) throw Error('formato');
    console.log(summarize(report));
  } catch {
    console.error('gitleaks: relatorio ausente ou invalido.');
    process.exitCode = 1;
  }
}
