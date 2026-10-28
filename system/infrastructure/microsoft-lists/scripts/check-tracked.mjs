import fs from 'node:fs';
import { allowedTracked } from './policy.mjs';
// Feed Git's index, not an ignored-files listing: forced additions must also fail.
try {
  const files = fs.readFileSync(0, 'utf8').split(/\0|\r?\n/).filter(Boolean);
  const rejected = files.filter(f => !allowedTracked(f)).length;
  console.log(`ML_INDEX: ${files.length} files checked; ${rejected} rejected.`);
  process.exitCode = rejected || !files.length ? 1 : 0;
} catch { console.error('ML_INDEX_READ'); process.exitCode = 1; }
