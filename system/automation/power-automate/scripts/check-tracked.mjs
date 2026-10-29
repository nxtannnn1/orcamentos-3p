import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
// Unicode Cc (controls) and Cf (format: bidi overrides, zero-width, BOM) never belong in a tracked path.
const unsafePathChar = /[\p{Cc}\p{Cf}]/u;
export function allowedTracked(file) {
  const root = 'system/automation/power-automate/';
  if (typeof file !== 'string' || unsafePathChar.test(file) || !file.startsWith(root)) return false;
  const name = file.slice(root.length);
  return /^(README|AUDIT)\.md$/.test(name)
    || /^flows\/[a-z0-9-]+\.sanitized\.json$/.test(name)
    || /^scripts\/[a-z0-9.-]+\.mjs$/.test(name)
    || name === 'templates/environment.example.json';
}
// Accepts only non-empty `git ls-files -z` output: every entry NUL-terminated, valid UTF-8, no Cc/Cf characters.
// A newline is never a separator, so a single tracked name cannot be split into allowed names.
// An empty list fails: it means the wrong path or a broken pipe, never a clean result.
export function parseIndex(buffer) {
  // ignoreBOM keeps a leading U+FEFF in the text so it is rejected instead of silently stripped.
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  if (!text.endsWith('\0')) throw Error('PA_INDEX_FORMAT');
  const files = text.slice(0, -1).split('\0');
  if (files.some(f => f === '' || unsafePathChar.test(f))) throw Error('PA_INDEX_FORMAT');
  return files;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const files = parseIndex(fs.readFileSync(0));
    const rejected = files.filter(f => !allowedTracked(f));
    console.log(`PA_INDEX: ${files.length} tracked files checked; ${rejected.length} rejected.`);
    // Never print a possibly sensitive filename or file contents.
    process.exitCode = rejected.length ? 1 : 0;
  } catch { console.error('PA_INDEX_READ'); process.exitCode = 1; }
}
