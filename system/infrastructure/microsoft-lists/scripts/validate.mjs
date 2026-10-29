import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inventory, schemaPaths, validateCollection, currentInventory, currentPaths, validateGraph } from './policy.mjs';

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

export function validateCurrentDirectory(directory) {
  const schemas=[], errors=new Set();
  for(const relative of currentPaths) try {
    for(const part of ['', 'arquivos-processados', path.dirname(relative)]) {
      const stat=fs.lstatSync(path.join(directory,part));
      if(!stat.isDirectory()||stat.isSymbolicLink())throw Error();
    }
    const file=path.join(directory,relative),stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw Error();
    const s=JSON.parse(fs.readFileSync(file,'utf8'));
    if(s.title!==currentInventory[relative.split('/')[1]])errors.add('ML_FILENAME_TITLE');
    validateGraph(s).forEach(e=>errors.add(e));schemas.push(s);
  } catch {errors.add('ML_FILE_OR_JSON');}
  for(const s of schemas)for(const c of s.columns??[])if(c.lookup?.listId?.startsWith('list:')) {
    const target=schemas.find(x=>x.title===c.lookup.listId.slice(5));
    if(!target?.columns.some(x=>x.name===c.lookup.columnName))errors.add('ML_UNRESOLVED_LOOKUP');
  }
  return {count:schemas.length,errors:[...errors]};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validateDirectory(fileURLToPath(new URL('../', import.meta.url)));
  console.log(`Microsoft Lists: ${result.count} schemas; ${result.errors.length} error categories. Human review required.`);
  if (result.errors.length) console.error(result.errors.join(', '));
  process.exitCode = result.errors.length ? 1 : 0;
  const current=validateCurrentDirectory(fileURLToPath(new URL('../',import.meta.url)));
  console.log(`Microsoft Lists Graph: ${current.count} schemas; ${current.errors.length} error categories.`);
  if(current.errors.length){console.error(current.errors.join(', '));process.exitCode=1;}
}
