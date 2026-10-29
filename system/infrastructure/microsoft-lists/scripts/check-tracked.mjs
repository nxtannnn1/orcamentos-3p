import fs from 'node:fs';
import { allowedTracked, parseIndex } from './policy.mjs';
// Feed Git's index (`git ls-files -z`), not an ignored-files listing: forced additions must also fail.
try {
  const files = parseIndex(fs.readFileSync(0));
  const rejected = files.filter(f => !allowedTracked(f)).length;
  console.log(`ML_INDEX: ${files.length} files checked; ${rejected} rejected.`);
  process.exitCode = rejected || !files.length ? 1 : 0;
} catch { console.error('ML_INDEX_READ'); process.exitCode = 1; }
