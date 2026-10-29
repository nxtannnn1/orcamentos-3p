// Execucao padronizada do gitleaks para CI e testes: mesma versao, mesmas flags, sem expor valores.
// Uso: node scripts/security/gitleaks.mjs preflight [--history]
//      node scripts/security/gitleaks.mjs scan-history <a..b|--all>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarize } from './summarize-gitleaks.mjs';

export const PINNED_VERSION = '8.30.1';
export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const configFile = path.join(repository, '.gitleaks.toml');
export const ignoreFile = path.join(repository, '.gitleaksignore');
const logOptsPattern = /^(?:[0-9a-f]{40}\.\.[0-9a-f]{40}|--all)$/;
// Variaveis GITLEAKS_* (ex.: GITLEAKS_CONFIG) e GIT_* nao podem redirecionar configuracao ou repositorio.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:GITLEAKS_|GIT_)/.test(key)));

export const binary = () => process.env.GITLEAKS_BIN || 'gitleaks';

export function checkVersion(executable = binary()) {
  const result = spawnSync(executable, ['version'], { encoding: 'utf8', env, timeout: 10000 });
  return !result.error && result.status === 0 && result.stdout.trim() === PINNED_VERSION;
}

export function isShallow(cwd = repository) {
  const result = spawnSync('git', ['rev-parse', '--is-shallow-repository'], { cwd, encoding: 'utf8', env });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim() === 'true';
}

// --ignore-gitleaks-allow: comentarios `gitleaks:allow` no codigo nao suprimem achados.
// O .gitleaksignore e passado explicitamente apenas quando informado (historico do repositorio).
export function scanArguments({ mode, config = configFile, logOpts, report, ignore }) {
  if (!['git', 'dir'].includes(mode)) throw Error('GITLEAKS_MODE');
  if (mode === 'git' && !logOptsPattern.test(logOpts ?? '')) throw Error('GITLEAKS_LOG_OPTS');
  return [mode, '.', '--config', config, '--redact', '--no-banner', '--ignore-gitleaks-allow', '--log-level', 'error',
    '--report-format', 'json', '--report-path', report, '--exit-code', '2',
    ...(ignore ? ['--gitleaks-ignore-path', ignore] : []),
    ...(mode === 'git' ? [`--log-opts=${logOpts}`] : [])];
}

// Retorna somente metadados: o relatorio (mesmo redigido) e apagado e a saida da ferramenta e descartada.
export function scan({ mode, target, config = configFile, logOpts, ignore, executable = binary() }) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitleaks-report-'));
  const report = path.join(reportDir, 'report.json');
  try {
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) return { status: 'error', findings: [] };
    const result = spawnSync(executable, scanArguments({ mode, config, logOpts, report, ignore }), {
      cwd: target, env, stdio: ['ignore', 'ignore', 'ignore'], timeout: 10 * 60 * 1000
    });
    if (result.error || result.signal || ![0, 2].includes(result.status)) return { status: 'error', findings: [] };
    const findings = JSON.parse(fs.readFileSync(report, 'utf8')).map((finding) => ({
      RuleID: finding.RuleID,
      File: String(finding.File ?? '').replace(/\\/g, '/').replace(/^\.\//, ''),
      StartLine: finding.StartLine,
      Commit: finding.Commit,
      Fingerprint: finding.Fingerprint
    }));
    // Status e relatorio precisam concordar; divergencia indica execucao incompleta.
    if ((result.status === 2) !== (findings.length > 0)) return { status: 'error', findings: [] };
    return { status: findings.length ? 'findings' : 'clean', findings };
  } catch {
    return { status: 'error', findings: [] };
  } finally {
    if (path.dirname(reportDir) !== os.tmpdir() || !path.basename(reportDir).startsWith('gitleaks-report-')) throw Error('GITLEAKS_REPORT_PATH');
    fs.rmSync(reportDir, { recursive: true, force: true });
  }
}

function sections(text) {
  const result = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*#.*$/, '').trim();
    if (!line) continue;
    if (line.startsWith('[')) { current = { header: line, lines: [] }; result.push(current); continue; }
    if (!current) { result.push(current = { header: '', lines: [] }); }
    current.lines.push(line);
  }
  return result;
}

// Invariantes do .gitleaks.toml: regras padrao ativas e excecoes estreitas (arquivo + linha exata + regra).
export function configProblems(text) {
  const problems = [];
  const all = sections(text);
  const extend = all.filter((section) => section.header === '[extend]');
  if (extend.length !== 1 || !extend[0].lines.includes('useDefault = true')) problems.push('DEFAULT_RULES_DISABLED');
  if (extend.some((section) => section.lines.some((line) => /^(?:disabledRules|path|url)\s*=/.test(line)))) problems.push('EXTEND_OVERRIDE');
  for (const { header } of all) {
    if (!['[extend]', '[[allowlists]]'].includes(header)) problems.push(`UNEXPECTED_SECTION ${header || '(topo)'}`);
  }
  const allowlists = all.filter((section) => section.header === '[[allowlists]]');
  if (allowlists.length > 1) problems.push('TOO_MANY_EXCEPTIONS');
  for (const { lines } of allowlists) {
    const body = lines.join('\n');
    // Exatamente um padrao literal por lista: o conteudo nao pode conter ''' (que abriria um segundo item).
    const single = /^(paths|regexes) = \['''((?:(?!''').)+)'''\]$/;
    const paths = lines.map((line) => line.match(single)).filter((m) => m?.[1] === 'paths').map((m) => m[2]);
    const regexes = lines.map((line) => line.match(single)).filter((m) => m?.[1] === 'regexes').map((m) => m[2]);
    if (!/^description = ".{10,}"$/m.test(body)) problems.push('EXCEPTION_WITHOUT_JUSTIFICATION');
    if (!/^condition = "AND"$/m.test(body)) problems.push('EXCEPTION_NOT_AND');
    if (!/^targetRules = \["[a-z0-9-]+"\]$/m.test(body)) problems.push('EXCEPTION_NOT_RULE_SCOPED');
    if (!/^regexTarget = "line"$/m.test(body)) problems.push('EXCEPTION_NOT_LINE_SCOPED');
    if (/^(?:commits|stopwords)\s*=/m.test(body)) problems.push('EXCEPTION_BROAD_KEY');
    if (lines.some((line) => /^(?:paths|regexes)\s*=/.test(line) && !single.test(line))) problems.push('EXCEPTION_LIST_FORMAT');
    if (paths.length !== 1 || regexes.length !== 1) problems.push('EXCEPTION_NOT_SINGLE');
    for (const pattern of [...paths, ...regexes]) {
      if (!pattern.endsWith('$') || /\.\*|\.\+|\\S\*|\[\^/.test(pattern)) problems.push('EXCEPTION_PATTERN_BROAD');
    }
    if (regexes.some((pattern) => !pattern.startsWith('^'))) problems.push('EXCEPTION_PATTERN_BROAD');
  }
  return [...new Set(problems)];
}

// Entradas de .gitleaksignore: so fingerprint completo de commit (commit:arquivo:regra:linha), cada uma precedida
// de comentario de justificativa. Fingerprints sem commit (arquivo:regra:linha) valeriam para qualquer commit.
export const ignoreEntryPattern = /^[0-9a-f]{40}:[A-Za-z0-9._/-]+:[a-z0-9-]+:[1-9]\d*$/;
export function ignoreEntries(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}
export function ignoreProblems(text) {
  const problems = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const seen = new Set();
  lines.forEach((line, index) => {
    if (!line || line.startsWith('#')) return;
    if (!ignoreEntryPattern.test(line)) problems.push('IGNORE_ENTRY_FORMAT');
    if (seen.has(line)) problems.push('IGNORE_DUPLICATE');
    seen.add(line);
    if (!lines[index - 1]?.startsWith('#') || lines[index - 1].replace(/^#\s*/, '').length < 20) problems.push('IGNORE_WITHOUT_JUSTIFICATION');
  });
  return [...new Set(problems)];
}

export function preflight({ history = false, executable = binary(), cwd = repository, config = configFile, ignore = ignoreFile } = {}) {
  const problems = [];
  if (!checkVersion(executable)) problems.push('GITLEAKS_VERSION');
  try {
    problems.push(...configProblems(fs.readFileSync(config, 'utf8')).map((problem) => `GITLEAKS_CONFIG ${problem}`));
  } catch {
    problems.push('GITLEAKS_CONFIG_READ');
  }
  if (fs.existsSync(ignore)) {
    problems.push(...ignoreProblems(fs.readFileSync(ignore, 'utf8')).map((problem) => `GITLEAKS_IGNORE ${problem}`));
  }
  if (history && isShallow(cwd) !== false) problems.push('GITLEAKS_SHALLOW_HISTORY');
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, argument] = process.argv.slice(2);
  if (command === 'preflight') {
    const problems = preflight({ history: argument === '--history' });
    console.log(problems.length ? `gitleaks preflight: falha (${problems.join(', ')}).` : `gitleaks preflight: ${PINNED_VERSION} ok.`);
    process.exitCode = problems.length ? 1 : 0;
  } else if (command === 'scan-history') {
    const problems = logOptsPattern.test(argument ?? '') ? preflight({ history: true }) : ['GITLEAKS_LOG_OPTS'];
    if (problems.length) {
      console.error(`gitleaks: pre-condicao nao atendida (${problems.join(', ')}).`);
      process.exitCode = 1;
    } else {
      const result = scan({ mode: 'git', target: repository, logOpts: argument, ignore: ignoreFile });
      if (result.status === 'error') console.error('gitleaks: erro de execucao; nenhum resultado confiavel.');
      else console.log(summarize(result.findings));
      process.exitCode = result.status === 'clean' ? 0 : 1;
    }
  } else {
    console.error('uso: gitleaks.mjs preflight [--history] | scan-history <a..b|--all>');
    process.exitCode = 1;
  }
}
