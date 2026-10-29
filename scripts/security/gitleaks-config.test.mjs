// Invariantes de .gitleaks.toml e do workflow de varredura, e deteccao real com o binario fixado.
// Os segredos sao sinteticos e gerados em tempo de execucao: nenhum valor de fixture e gravado no repositorio.
// Sem binario os testes reais sao pulados localmente; em CI, GITLEAKS_REQUIRED=1 transforma a ausencia em falha.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  PINNED_VERSION,
  checkVersion,
  configFile,
  configProblems,
  ignoreEntries,
  ignoreFile,
  ignoreProblems,
  isShallow,
  preflight,
  repository,
  scan,
  scanArguments
} from './gitleaks.mjs';
import { summarize } from './summarize-gitleaks.mjs';

const config = fs.readFileSync(configFile, 'utf8');
const workflow = fs.readFileSync(path.join(repository, '.github/workflows/security-scan.yml'), 'utf8');
const authServiceCi = fs.readFileSync(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeTemp(dir, prefix) {
  if (path.dirname(dir) !== os.tmpdir() || !path.basename(dir).startsWith(prefix)) throw Error('SECURITY_TEST_PATH');
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeTree(root, files) {
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
}

test('configuracao atual atende as invariantes', () => {
  assert.deepEqual(configProblems(config), []);
});

test('configuracoes que desativam regras ou ampliam excecoes sao rejeitadas', () => {
  const swap = (from, to) => {
    assert.ok(config.includes(from), from);
    // split/join: String.replace interpretaria `$'` da substituicao como padrao especial.
    return config.split(from).join(to);
  };
  const cases = [
    [swap('useDefault = true', 'useDefault = false'), 'DEFAULT_RULES_DISABLED'],
    [config.replace(/\[extend\][\s\S]*?useDefault = true/, ''), 'DEFAULT_RULES_DISABLED'],
    [swap('useDefault = true', 'useDefault = true\ndisabledRules = ["generic-api-key"]'), 'EXTEND_OVERRIDE'],
    [config + '\n[allowlist]\npaths = [\'\'\'.*\'\'\']\n', 'UNEXPECTED_SECTION [allowlist]'],
    [config + '\n[[rules]]\nid = "generic-api-key"\nregex = \'\'\'x\'\'\'\n', 'UNEXPECTED_SECTION [[rules]]'],
    [swap("paths = ['''(?:^|/)system/infrastructure/k8s/auth-service/deployment\\.yml$''']", "paths = ['''.*''']"), 'EXCEPTION_PATTERN_BROAD'],
    [swap("paths = ['''(?:^|/)system/infrastructure/k8s/auth-service/deployment\\.yml$''']", "paths = ['''deployment\\.yml''']"), 'EXCEPTION_PATTERN_BROAD'],
    [swap("auth-service:sha-[0-9a-f]{40}\\s*$'''", "auth-service:.+$'''"), 'EXCEPTION_PATTERN_BROAD'],
    [swap("'''^\\s*image:", "'''\\s*image:"), 'EXCEPTION_PATTERN_BROAD'],
    [swap('condition = "AND"\n', ''), 'EXCEPTION_NOT_AND'],
    [swap('condition = "AND"', 'condition = "OR"'), 'EXCEPTION_NOT_AND'],
    [swap('targetRules = ["generic-api-key"]\n', ''), 'EXCEPTION_NOT_RULE_SCOPED'],
    [swap('regexTarget = "line"', 'regexTarget = "match"'), 'EXCEPTION_NOT_LINE_SCOPED'],
    [swap('condition = "AND"', 'condition = "AND"\nstopwords = ["sha"]'), 'EXCEPTION_BROAD_KEY'],
    [swap('condition = "AND"', 'condition = "AND"\ncommits = ["' + 'a'.repeat(40) + '"]'), 'EXCEPTION_BROAD_KEY'],
    [swap("paths = ['''(?:^|/)", "paths = ['''a$''', '''(?:^|/)"), 'EXCEPTION_LIST_FORMAT'],
    [config + '\n[[allowlists]]\ndescription = "outra excecao qualquer"\n', 'TOO_MANY_EXCEPTIONS'],
    [swap('description = "GHCR image tag pinned by commit SHA (not a secret)"', ''), 'EXCEPTION_WITHOUT_JUSTIFICATION']
  ];
  for (const [text, expected] of cases) {
    assert.ok(configProblems(text).includes(expected), `${expected}: ${configProblems(text).join(', ')}`);
  }
});

test('workflows fixam a mesma versao, checksum, preflight e varredura centralizada', () => {
  assert.match(workflow, new RegExp(`GITLEAKS_VERSION: '${PINNED_VERSION.replace(/\./g, '\\.')}'`));
  assert.match(authServiceCi, new RegExp(`GITLEAKS_VERSION: '${PINNED_VERSION.replace(/\./g, '\\.')}'`));
  assert.match(workflow, /GITLEAKS_SHA256: '[0-9a-f]{64}'/);
  assert.match(workflow, /sha256sum --check --strict/);
  assert.match(workflow, /node scripts\/security\/gitleaks\.mjs preflight --history/);
  assert.match(workflow, /node scripts\/security\/gitleaks\.mjs scan-history "\$LOG_OPTS"/);
  assert.match(workflow, /fetch-depth: 0/);
  // O binario so e chamado pelo modulo, que sempre aplica --redact e --ignore-gitleaks-allow.
  assert.equal(/"\$GITLEAKS_BIN"\s+(?:git|dir|detect)/.test(workflow), false);
  assert.equal(/upload-artifact|gitleaks-action|pull-requests:\s*write|\$\{\{\s*secrets\./.test(workflow), false);
  assert.match(workflow, /^permissions:\s*\n\s+contents: read\s*$/m);
});

test('argumentos sempre redigem, ignoram gitleaks:allow e validam o intervalo', () => {
  const report = path.join(os.tmpdir(), 'r.json');
  for (const args of [
    scanArguments({ mode: 'dir', report }),
    scanArguments({ mode: 'git', report, logOpts: '--all' }),
    scanArguments({ mode: 'git', report, logOpts: `${'a'.repeat(40)}..${'b'.repeat(40)}` })
  ]) {
    assert.ok(args.includes('--redact'));
    assert.ok(args.includes('--ignore-gitleaks-allow'));
    assert.ok(args.includes('--no-banner'));
    assert.equal(args.some((arg) => /^(?:-v|--verbose)$|debug|trace/.test(arg)), false);
  }
  for (const logOpts of [undefined, '', 'HEAD', '-1', '--all --output=/tmp/x', `${'a'.repeat(40)}..HEAD`, '--all\n--patch']) {
    assert.throws(() => scanArguments({ mode: 'git', report, logOpts }), /GITLEAKS_LOG_OPTS/);
  }
  assert.throws(() => scanArguments({ mode: 'detect', report }), /GITLEAKS_MODE/);
});

test('resumo de relatorio nunca imprime segredo, match ou linha', () => {
  const secret = 'ghp_' + randomBytes(18).toString('hex');
  const output = summarize([{ RuleID: 'github-pat', File: 'a/b.txt', StartLine: 3, Commit: 'a'.repeat(40), Fingerprint: 'fp\nforjado', Secret: secret, Match: `token=${secret}`, Line: `token=${secret}` }]);
  assert.equal(output.includes(secret), false);
  assert.match(output, /github-pat a\/b\.txt:3 commit=aaaaaaaaaaaa fingerprint=fp\?forjado/);
  assert.equal(output.split('\n').length, 2);
});

test('binario ausente ou de outra versao reprova o preflight', () => {
  assert.equal(checkVersion(path.join(os.tmpdir(), 'gitleaks-inexistente')), false);
  // Node com o argumento "version" nao imprime a versao fixada.
  assert.equal(checkVersion(process.execPath), false);
  assert.ok(preflight({ executable: process.execPath }).includes('GITLEAKS_VERSION'));
});

test('clone superficial reprova o preflight de historico; clone completo nao', () => {
  const root = tempDir('gitleaks-shallow-');
  const git = (args, cwd) => execFileSync('git', ['-c', 'user.name=synthetic', '-c', 'user.email=synthetic@example.invalid', ...args], { cwd, env: gitEnv, stdio: 'pipe' });
  try {
    const origin = path.join(root, 'origin');
    fs.mkdirSync(origin);
    git(['init', '--quiet'], origin);
    for (const n of [1, 2]) {
      fs.writeFileSync(path.join(origin, 'f.txt'), String(n));
      git(['add', 'f.txt'], origin);
      git(['commit', '--quiet', '-m', `c${n}`], origin);
    }
    git(['clone', '--quiet', '--depth', '1', pathToUrl(origin), 'shallow'], root);
    git(['clone', '--quiet', pathToUrl(origin), 'full'], root);
    assert.equal(isShallow(path.join(root, 'shallow')), true);
    assert.equal(isShallow(path.join(root, 'full')), false);
    assert.equal(isShallow(root), null);
    const shallow = preflight({ history: true, executable: process.execPath, cwd: path.join(root, 'shallow') });
    assert.ok(shallow.includes('GITLEAKS_SHALLOW_HISTORY'));
    assert.ok(preflight({ history: true, executable: process.execPath, cwd: root }).includes('GITLEAKS_SHALLOW_HISTORY'));
    assert.equal(preflight({ history: true, executable: process.execPath, cwd: path.join(root, 'full') }).includes('GITLEAKS_SHALLOW_HISTORY'), false);
  } finally {
    removeTemp(root, 'gitleaks-shallow-');
  }
});

function pathToUrl(dir) {
  return 'file://' + dir.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:');
}

function requireBinary(t) {
  if (checkVersion()) return true;
  assert.notEqual(process.env.GITLEAKS_REQUIRED, '1', `gitleaks ${PINNED_VERSION} obrigatorio neste ambiente`);
  t.skip(`gitleaks ${PINNED_VERSION} indisponivel: deteccao real NAO VERIFICADA`);
  return false;
}

// Sem vogais (nem 0/1): o valor aleatorio nunca forma uma stopword do gitleaks, que descartaria o achado
// e tornaria o teste intermitente. A entropia (~4,8 bits) continua acima do limite das regras.
const alnum = (length) => {
  const chars = 'BCDFGHJKLMNPQRSTVWXZbcdfghjkmnpqrstvwxz23456789';
  return [...randomBytes(length)].map((byte) => chars[byte % chars.length]).join('');
};
const base32 = (length) => [...randomBytes(length)].map((byte) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[byte % 32]).join('');
// Valores aleatorios no formato dos provedores; nao correspondem a nenhuma credencial existente.
const syntheticSecrets = () => ({
  githubPat: 'ghp_' + alnum(36),
  awsKey: 'AKIA' + base32(16),
  genericKey: alnum(32),
  // Marcadores PEM concatenados para que este arquivo nao case com a regra private-key.
  privateKey: ['-----BEGIN ' + 'PRIVATE KEY-----', ...randomBytes(192).toString('base64').match(/.{1,64}/g), '-----END ' + 'PRIVATE KEY-----'].join('\n'),
  sha: randomBytes(20).toString('hex')
});
const deployment = 'system/infrastructure/k8s/auth-service/deployment.yml';

function scanTree(files, options = {}) {
  const source = tempDir('gitleaks-fixture-');
  try {
    writeTree(source, files);
    return scan({ mode: 'dir', target: source, ...options });
  } finally {
    removeTemp(source, 'gitleaks-fixture-');
  }
}

test('deteccao real: regras padrao, excecao delimitada e nenhum valor exposto', (t) => {
  if (!requireBinary(t)) return;
  const fake = syntheticSecrets();
  const imageLine = `          image: ghcr.io/nxtannnn1/auth-service:sha-${fake.sha}`;
  const result = scanTree({
    'config/app.env': `GITHUB_TOKEN=${fake.githubPat}\n`,
    'config/aws.ini': `aws_access_key_id = ${fake.awsKey}\n`,
    'config/service.yml': `service:\n  api_key: "${fake.genericKey}"\n`,
    'config/key.pem': `${fake.privateKey}\n`,
    [deployment]: `spec:\n  containers:\n${imageLine}\n          auth_token: "sha-${fake.sha}"\n`,
    'other/deployment.yml': `${imageLine}\n`
  });
  assert.equal(result.status, 'findings');
  const has = (file, rule, line) => result.findings.some((f) => f.File === file && (!rule || f.RuleID === rule) && (!line || f.StartLine === line));
  const detail = JSON.stringify(result.findings.map((f) => [f.RuleID, f.File, f.StartLine]));
  assert.ok(has('config/app.env', 'github-pat'), detail);
  assert.ok(has('config/aws.ini', 'aws-access-token'), detail);
  assert.ok(has('config/service.yml', 'generic-api-key'), detail);
  assert.ok(has('config/key.pem', 'private-key'), detail);
  // A linha `image:` e a unica excecao; outra linha do mesmo arquivo continua detectada.
  assert.equal(has(deployment, null, 3), false, detail);
  assert.ok(has(deployment, null, 4), detail);
  // A mesma linha fora do caminho permitido e detectada: justifica a excecao e prova que ela depende do arquivo.
  assert.ok(has('other/deployment.yml', 'generic-api-key'), detail);
  const serialized = JSON.stringify(result);
  for (const value of [fake.githubPat, fake.awsKey, fake.genericKey, fake.sha, ...fake.privateKey.split('\n').slice(1, -1)]) {
    assert.equal(serialized.includes(value), false, 'valor sintetico exposto no resultado');
  }
});

test('deteccao real: comentario gitleaks:allow nao esconde segredo', (t) => {
  if (!requireBinary(t)) return;
  const fake = syntheticSecrets();
  const result = scanTree({
    'a.env': `GITHUB_TOKEN=${fake.githubPat} # gitleaks:allow\n`,
    'b.yml': `api_key: "${fake.genericKey}" # gitleaks:allow\n`
  });
  assert.equal(result.status, 'findings');
  assert.ok(result.findings.some((f) => f.File === 'a.env' && f.RuleID === 'github-pat'));
  assert.ok(result.findings.some((f) => f.File === 'b.yml'));
});

test('deteccao real: conteudo extra na linha da excecao nao e aceito', (t) => {
  if (!requireBinary(t)) return;
  const fake = syntheticSecrets();
  const result = scanTree({ [deployment]: `          image: ghcr.io/nxtannnn1/auth-service:sha-${fake.sha} # api_key=${fake.genericKey}\n` });
  assert.equal(result.status, 'findings');
});

test('deteccao real: configuracao invalida, diretorio ausente e excecao abrangente', (t) => {
  if (!requireBinary(t)) return;
  const fake = syntheticSecrets();
  const configs = tempDir('gitleaks-configs-');
  try {
    const broken = path.join(configs, 'broken.toml');
    fs.writeFileSync(broken, '[[allowlists\npaths = [');
    assert.equal(scanTree({ 'a.env': `GITHUB_TOKEN=${fake.githubPat}\n` }, { config: broken }).status, 'error');
    assert.equal(scanTree({ 'a.env': 'x\n' }, { config: path.join(configs, 'inexistente.toml') }).status, 'error');
    assert.equal(scan({ mode: 'dir', target: path.join(configs, 'diretorio-ausente') }).status, 'error');
    // Uma excecao abrangente realmente esconderia o segredo: por isso configProblems a rejeita antes da varredura.
    const broad = path.join(configs, 'broad.toml');
    fs.writeFileSync(broad, "[extend]\nuseDefault = true\n[[allowlists]]\ndescription = \"excecao abrangente de teste\"\npaths = ['''.*''']\n");
    assert.ok(configProblems(fs.readFileSync(broad, 'utf8')).length > 0);
    assert.equal(scanTree({ 'a.env': `GITHUB_TOKEN=${fake.githubPat}\n` }, { config: broad }).status, 'clean');
    assert.equal(scanTree({ 'a.env': `GITHUB_TOKEN=${fake.githubPat}\n` }).status, 'findings');
    assert.equal(scanTree({ 'a.txt': 'conteudo benigno SITE_PLACEHOLDER\n' }).status, 'clean');
  } finally {
    removeTemp(configs, 'gitleaks-configs-');
  }
});

// Conjunto exato aceito: ampliar o .gitleaksignore exige alterar este teste no mesmo PR.
const ACCEPTED_HISTORICAL_FINGERPRINTS = [
  '5decc25bb45a64816461483bafd8a91d4fcd5bf7:system/apps/operator-web/src/server/security/redis-lab.integration.test.ts:generic-api-key:53',
  'bac69e3e638e478ef1c2eae17331390abd688ecd:system/apps/operator-web/scripts/start-dev-local.mjs:generic-api-key:4'
];

test('.gitleaksignore contem exatamente os fingerprints historicos aceitos, cada um justificado', () => {
  const text = fs.readFileSync(ignoreFile, 'utf8');
  assert.deepEqual(ignoreProblems(text), []);
  assert.deepEqual(ignoreEntries(text), ACCEPTED_HISTORICAL_FINGERPRINTS);
  // Cada commit aceito existe no historico e contem o arquivo apontado.
  for (const entry of ACCEPTED_HISTORICAL_FINGERPRINTS) {
    const [commit, file] = entry.split(':');
    const probe = spawnSync('git', ['cat-file', '-e', `${commit}:${file}`], { cwd: repository, env: gitEnv });
    assert.equal(probe.status, 0, entry);
  }
});

test('.gitleaksignore rejeita entradas abrangentes, malformadas, duplicadas ou sem justificativa', () => {
  const why = '# justificativa suficientemente detalhada';
  const valid = `${'a'.repeat(40)}:dir/file.txt:generic-api-key:3`;
  assert.deepEqual(ignoreProblems(`${why}\n${valid}\n`), []);
  const cases = [
    [`${why}\ndir/file.txt:generic-api-key:3\n`, 'IGNORE_ENTRY_FORMAT'],
    [`${why}\n${'a'.repeat(12)}:dir/file.txt:generic-api-key:3\n`, 'IGNORE_ENTRY_FORMAT'],
    [`${why}\n${'a'.repeat(40)}:*:generic-api-key:3\n`, 'IGNORE_ENTRY_FORMAT'],
    [`${why}\n${'a'.repeat(40)}:dir/*.txt:generic-api-key:3\n`, 'IGNORE_ENTRY_FORMAT'],
    [`${why}\n${'a'.repeat(40)}:dir/file.txt:generic-api-key\n`, 'IGNORE_ENTRY_FORMAT'],
    [`${why}\n${'a'.repeat(40)}:dir/file.txt:generic-api-key:0\n`, 'IGNORE_ENTRY_FORMAT'],
    [`${why}\n${'a'.repeat(40)}:dir/my file.txt:generic-api-key:3\n`, 'IGNORE_ENTRY_FORMAT'],
    [`${valid}\n`, 'IGNORE_WITHOUT_JUSTIFICATION'],
    [`# curto\n${valid}\n`, 'IGNORE_WITHOUT_JUSTIFICATION'],
    [`${why}\n${valid}\n\n${valid}\n`, 'IGNORE_WITHOUT_JUSTIFICATION'],
    [`${why}\n${valid}\n${why}\n${valid}\n`, 'IGNORE_DUPLICATE']
  ];
  for (const [text, expected] of cases) assert.ok(ignoreProblems(text).includes(expected), `${expected}: ${JSON.stringify(text)}`);
  const report = path.join(os.tmpdir(), 'r.json');
  assert.ok(scanArguments({ mode: 'git', report, logOpts: '--all', ignore: ignoreFile }).join(' ').includes(`--gitleaks-ignore-path ${ignoreFile}`));
  assert.equal(scanArguments({ mode: 'dir', report }).includes('--gitleaks-ignore-path'), false);
});

test('conteudo atual: teste do Redis sem segredo fixo; nome de conteiner continua sendo um falso positivo conhecido', (t) => {
  const redisTest = 'system/apps/operator-web/src/server/security/redis-lab.integration.test.ts';
  const devLocal = 'system/apps/operator-web/scripts/start-dev-local.mjs';
  const redisText = fs.readFileSync(path.join(repository, redisTest), 'utf8');
  assert.match(redisText, /AUTH_SESSION_SECRET: randomUUID\(\) \+ randomUUID\(\)/);
  assert.equal(/AUTH_SESSION_SECRET:\s*["'`]/.test(redisText), false);
  if (!requireBinary(t)) return;
  const result = scanTree({ [redisTest]: redisText, [devLocal]: fs.readFileSync(path.join(repository, devLocal), 'utf8') });
  assert.deepEqual(result.findings.map((f) => `${f.RuleID} ${f.File}:${f.StartLine}`), [`generic-api-key ${devLocal}:4`]);
});

test('deteccao real: fingerprint aceito vale so para o seu commit', (t) => {
  if (!requireBinary(t)) return;
  const fake = syntheticSecrets();
  const root = tempDir('gitleaks-history-');
  const git = (args) => execFileSync('git', ['-c', 'user.name=synthetic', '-c', 'user.email=synthetic@example.invalid', ...args], { cwd: path.join(root, 'repo'), env: gitEnv, stdio: 'pipe' });
  try {
    fs.mkdirSync(path.join(root, 'repo'));
    git(['init', '--quiet']);
    fs.writeFileSync(path.join(root, 'repo', 'app.env'), `GITHUB_TOKEN=${fake.githubPat}\n`);
    git(['add', 'app.env']);
    git(['commit', '--quiet', '-m', 'c1']);
    const first = scan({ mode: 'git', target: path.join(root, 'repo'), logOpts: '--all' });
    assert.equal(first.status, 'findings');
    const ignore = path.join(root, 'ignore');
    fs.writeFileSync(ignore, `# falso positivo sintetico para o teste de escopo\n${first.findings[0].Fingerprint}\n`);
    assert.deepEqual(ignoreProblems(fs.readFileSync(ignore, 'utf8')), []);
    assert.equal(scan({ mode: 'git', target: path.join(root, 'repo'), logOpts: '--all', ignore }).status, 'clean');
    // O mesmo segredo reintroduzido em outro commit nao herda a aceitacao.
    fs.writeFileSync(path.join(root, 'repo', 'app.env'), 'vazio\n');
    git(['commit', '--quiet', '-am', 'c2']);
    fs.writeFileSync(path.join(root, 'repo', 'app.env'), `GITHUB_TOKEN=${fake.githubPat}\n`);
    git(['commit', '--quiet', '-am', 'c3']);
    const again = scan({ mode: 'git', target: path.join(root, 'repo'), logOpts: '--all', ignore });
    assert.equal(again.status, 'findings');
    assert.equal(again.findings.length, 1);
    assert.notEqual(again.findings[0].Fingerprint, first.findings[0].Fingerprint);
    assert.equal(JSON.stringify(again).includes(fake.githubPat), false);
  } finally {
    removeTemp(root, 'gitleaks-history-');
  }
});
