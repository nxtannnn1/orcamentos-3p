import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
export function allowedTracked(file) {
  const root = 'system/automation/power-automate/';
  if (!file.startsWith(root)) return false;
  const name = file.slice(root.length);
  return /^(README|AUDIT)\.md$/.test(name)
    || /^flows\/[a-z0-9-]+\.sanitized\.json$/.test(name)
    || /^scripts\/[a-z0-9.-]+\.mjs$/.test(name)
    || name === 'templates/environment.example.json';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = fs.readFileSync(0, 'utf8').split(/\0|\r?\n/).filter(Boolean);
  const rejected = files.filter(f => !allowedTracked(f));
  console.log(`PA_INDEX: ${files.length} tracked files checked; ${rejected.length} rejected.`);
  // Never print a possibly sensitive filename or file contents.
  process.exitCode = rejected.length ? 1 : 0;
}
