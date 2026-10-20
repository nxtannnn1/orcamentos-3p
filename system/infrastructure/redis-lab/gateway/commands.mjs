export const RATE_LIMIT_SCRIPT = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
export const RELEASE_CORRECTION_LOCK = "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const lock = /^3p:correction:[0-9a-f]{64}:item:[1-9]\d*:pending$/;
const durable = key => key.startsWith("3p:correction:") || key.startsWith("3p:audit:");
const validKey = key => {
  if (typeof key !== "string" || key.length > 512 || !/^3p:[A-Za-z0-9:_-]+$/.test(key)) return false;
  if (!key.startsWith("3p:correction:")) return true;
  if (/^3p:correction:[0-9a-f]{64}:item:[1-9]\d*:(pending|original)$/.test(key)) return true;
  const operation = /^3p:correction:[0-9a-f]{64}:operation:([^:]+):(intent|outcome|reconciled)$/.exec(key);
  return !!operation && uuid.test(operation[1]);
};
const ttl = value => Number.isSafeInteger(value) && value > 0 && value <= 86400;

/**
 * Validate the wire contract before any Redis call; never normalize Lua bytes.
 * This is a command boundary, not user authorization (which belongs to the BFF).
 * Keep changes aligned with Operator Web scripts.ts and gateway.test.mjs.
 */
export function validCommand(command) {
  if (!Array.isArray(command) || command.length < 2 || command.length > 6 ||
      !command.every(v => typeof v === "string" || (typeof v === "number" && Number.isFinite(v)))) return false;
  const [op, key, value, option, seconds, nx] = command;
  if (op === "EVAL") {
    if (command.length !== 5 || value !== 1 || !validKey(option)) return false;
    if (key === RELEASE_CORRECTION_LOCK) return lock.test(option) && typeof seconds === "string" && uuid.test(seconds);
    return key === RATE_LIMIT_SCRIPT && !durable(option) && ttl(seconds) && seconds <= 3600;
  }
  if (!validKey(key)) return false;
  // Correction evidence is append-only; pending locks are removed only by CAS.
  if (["DEL", "INCR"].includes(op) && durable(key)) return false;
  if (["GET", "DEL", "INCR"].includes(op)) return command.length === 2;
  if (op !== "SET" || typeof value !== "string" || Buffer.byteLength(value) > 60000) return false;
  if (key.endsWith(":pending") && (!lock.test(key) || !uuid.test(value))) return false;
  if (command.length === 4 && option === "NX") return true;
  // Durable correction records and locks deliberately have no expiry.
  return !durable(key) && command.length === 6 && option === "EX" && ttl(seconds) && nx === "NX";
}
