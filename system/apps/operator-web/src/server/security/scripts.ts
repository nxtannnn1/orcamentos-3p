// Exact Lua bytes are part of the Redis REST gateway allowlist contract.
export const RELEASE_CORRECTION_LOCK = "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
