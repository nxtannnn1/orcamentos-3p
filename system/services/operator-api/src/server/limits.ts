import "server-only";
import { ApiError } from "./errors";
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { started: number; used: number }>();
  constructor(private readonly max: number, private readonly interval = 60_000) {}
  take(key: string, now = Date.now()) {
    let window = this.windows.get(key);
    if (!window || now - window.started >= this.interval) {
      window = { started: now, used: 0 }; this.windows.set(key, window);
    }
    if (++window.used > this.max)
      throw new ApiError(429, "RATE_LIMITED", "Limite temporário de solicitações.");
  }
}
export class ConcurrencyLimit {
  private active = 0;
  constructor(private readonly max: number) {}
  enter(): () => void {
    if (this.active >= this.max)
      throw new ApiError(503, "BUSY", "Serviço temporariamente ocupado.");
    this.active++;
    let released = false;
    return () => { if (!released) { released = true; this.active--; } };
  }
}
// Somente chaves internas ou IDs de clientes validados: o mapa tem cardinalidade limitada.
export const incoming = new FixedWindowLimiter(600);
export const clients = new FixedWindowLimiter(120);
export const concurrency = new ConcurrencyLimit(8);
