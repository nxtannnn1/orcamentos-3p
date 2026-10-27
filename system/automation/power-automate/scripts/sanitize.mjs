import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitize } from './policy.mjs';
import { readDefinition } from './read-zip.mjs';
const root = fs.realpathSync(fileURLToPath(new URL('../../../../', import.meta.url)));
try {
  let gitDir = path.join(root, '.git');
  if (fs.statSync(gitDir).isFile()) gitDir = path.resolve(root, fs.readFileSync(gitDir, 'utf8').trim().replace(/^gitdir: /, ''));
  if (fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim() !== 'ref: refs/heads/infra-lab') throw Error('PA_BRANCH');
  const [source, name] = process.argv.slice(2);
  if (!source || !/^[a-z0-9-]+\.sanitized\.json$/.test(name ?? '')) throw Error('PA_USAGE: sanitize.mjs EXTERNAL_JSON name.sanitized.json');
  const sourceReal = source === '--stdin' ? null : fs.realpathSync(source);
  if (sourceReal) {
  const relative = path.relative(root, sourceReal);
  if (!sourceReal.toLowerCase().endsWith('.zip') && (relative === '' || !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) throw Error('PA_RAW_MUST_BE_EXTERNAL');
  }
  const outputDir = fs.realpathSync(fileURLToPath(new URL('../flows/', import.meta.url)));
  if (outputDir !== path.join(root, 'system', 'automation', 'power-automate', 'flows')) throw Error('PA_OUTPUT_PATH');
  // Validate in memory BEFORE creating a file. Never write raw or a replacement map.
  const input = sourceReal?.toLowerCase().endsWith('.zip') ? readDefinition(fs.readFileSync(sourceReal)) : fs.readFileSync(sourceReal ?? 0, 'utf8');
  const result = sanitize(JSON.parse(input.replace(/^\uFEFF/, '')));
  const outputFile = path.join(outputDir, name);
  const replace = process.argv.includes('--replace');
  if (fs.existsSync(outputFile)) {
    if (!replace || fs.lstatSync(outputFile).isSymbolicLink() || JSON.parse(fs.readFileSync(outputFile, 'utf8')).format !== 'power-automate-sanitized-v1') throw Error('PA_EXISTING_OUTPUT_PROTECTED');
  }
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2) + '\n', { flag: replace ? 'w' : 'wx' });
  console.log('PA_SANITIZED: human review required; not directly importable.');
} catch (e) {
  // JSON parse/filesystem errors can contain confidential input or paths.
  console.error(e.message?.startsWith('PA_') ? e.message : 'PA_FAILED: invalid input, inaccessible file or output already exists.');
  process.exitCode = 1;
}
