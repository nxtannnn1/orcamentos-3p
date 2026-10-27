import fs from 'node:fs';
import { validate } from './policy.mjs';
const dir = new URL('../flows/', import.meta.url);
let failures = 0, count = 0;
for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
  if (entry.name === '.gitkeep') continue;
  if (entry.name.endsWith('.zip')) continue; // private input, ignored by Git; never a versioned artifact
  count++;
  let errors;
  try {
    if (!entry.isFile() || !/^[a-z0-9-]+\.sanitized\.json$/.test(entry.name)) throw Error();
    errors = validate(JSON.parse(fs.readFileSync(new URL(entry.name, dir), 'utf8')));
  } catch { errors = ['PA_FILE_OR_JSON']; }
  if (errors.length) { failures++; console.error(`Artifact ${count}: ${errors.join(', ')}`); }
}
console.log(`Power Automate: ${count} artifact(s), ${failures} rejected; human review remains mandatory.`);
process.exitCode = failures ? 1 : 0;
