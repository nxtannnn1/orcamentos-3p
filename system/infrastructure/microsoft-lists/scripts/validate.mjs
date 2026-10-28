import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inventory, schemaPaths, validateCollection } from './policy.mjs';

export function validateDirectory(directory) {
  const schemas = [], errors = new Set();
  for (const relative of schemaPaths) {
    try {
      const [dir] = relative.split('/');
      // Do not follow a directory or artifact symlink to external/private content.
      if (fs.lstatSync(directory).isSymbolicLink() || !fs.lstatSync(path.join(directory, dir)).isDirectory() || fs.lstatSync(path.join(directory, dir)).isSymbolicLink()) throw Error();
      const file = path.join(directory, relative), stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw Error();
      const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (schema?.title !== inventory[dir]) errors.add('ML_FILENAME_TITLE');
      schemas.push(schema);
    } catch { errors.add('ML_FILE_OR_JSON'); }
  }
  for (const code of validateCollection(schemas)) errors.add(code);
  return { count: schemas.length, errors: [...errors] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validateDirectory(fileURLToPath(new URL('../', import.meta.url)));
  console.log(`Microsoft Lists: ${result.count} schemas; ${result.errors.length} error categories. Human review required.`);
  if (result.errors.length) console.error(result.errors.join(', '));
  process.exitCode = result.errors.length ? 1 : 0;
}
