import { inflateRawSync } from 'node:zlib';
// Read-only ZIP parser for one legacy definition.json; never extracts paths to disk.
export function readDefinition(buffer) {
  if (buffer.length > 25 * 1024 * 1024) throw Error('PA_ZIP_LIMIT');
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
  }
  if (end < 0 || buffer.readUInt32LE(end + 4) !== 0) throw Error('PA_ZIP_FORMAT');
  let offset = buffer.readUInt32LE(end + 16);
  const count = buffer.readUInt16LE(end + 10), matches = [];
  if (count > 1000) throw Error('PA_ZIP_LIMIT');
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw Error('PA_ZIP_DIRECTORY');
    const flags = buffer.readUInt16LE(offset + 8), method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20), size = buffer.readUInt32LE(offset + 24);
    const nameSize = buffer.readUInt16LE(offset + 28), extra = buffer.readUInt16LE(offset + 30), comment = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
    if (name.split('/').at(-1) === 'definition.json') {
      if (flags & 1 || size > 10 * 1024 * 1024 || ![0, 8].includes(method)) throw Error('PA_ZIP_UNSUPPORTED');
      const local = buffer.readUInt32LE(offset + 42);
      if (buffer.readUInt32LE(local) !== 0x04034b50) throw Error('PA_ZIP_LOCAL');
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      if (start + compressed > buffer.length) throw Error('PA_ZIP_TRUNCATED');
      const data = buffer.subarray(start, start + compressed);
      const result = method === 8 ? inflateRawSync(data, { maxOutputLength: 10 * 1024 * 1024 }) : data;
      if (result.length !== size) throw Error('PA_ZIP_SIZE');
      let crc = 0xffffffff;
      for (const byte of result) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
      if (((crc ^ 0xffffffff) >>> 0) !== buffer.readUInt32LE(offset + 16)) throw Error('PA_ZIP_CRC');
      matches.push(result.toString('utf8'));
    }
    offset += 46 + nameSize + extra + comment;
  }
  if (matches.length !== 1) throw Error('PA_ZIP_EXPECT_ONE_DEFINITION');
  return matches[0];
}
