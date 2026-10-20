/** TEST ONLY. Models one item; no Redis, disk, HTTP, or production durability. */
import { canonical, ProposalError, type Scope } from "../../reopening-proposal/contract";
import { project, validateEvent, type Event } from "../ledger";

export class MemoryLedger {
  private journal: Event[] = [];
  available = true;
  constructor(private readonly scope: Scope) {}
  events() {
    if (!this.available) throw new ProposalError("DURABLE_AUDIT_FAILURE");
    return structuredClone(this.journal);
  }
  append(raw: unknown, expectedHead: string | null, failure: "none" | "before" | "after" = "none") {
    if (!this.available || failure === "before") throw new ProposalError("DURABLE_AUDIT_FAILURE");
    const event = validateEvent(raw);
    if (canonical(event.scope) !== canonical(this.scope)) throw new ProposalError("SCOPE_CONFLICT");
    const duplicate = this.journal.find(value => value.eventId === event.eventId);
    if (duplicate) {
      if (canonical(duplicate) !== canonical(event)) throw new ProposalError("UUID_CONTENT_CONFLICT");
      return structuredClone(duplicate); // Lost append response: retrieve, never repeat remote write.
    }
    const last = this.journal.at(-1);
    if ((last?.eventId ?? null) !== expectedHead) throw new ProposalError("CAS_CONFLICT");
    const operation = this.journal.filter(value => value.operationId === event.operationId);
    if (!operation.length && last) {
      const prior = this.journal.filter(value => value.operationId === last.operationId);
      if (project(prior, true).blocked) throw new ProposalError("ITEM_BLOCKED");
      if (event.type !== "INTENT" || (last.type !== "OBSERVATION" && last.type !== "RECONCILIATION") ||
          canonical(event.payload.before) !== canonical(last.payload.read)) throw new ProposalError("STATE_CONFLICT");
    } else if (operation.length && last?.operationId !== event.operationId) {
      // Delayed evidence must go through a future multi-stream administrative transaction, not reorder this model.
      throw new ProposalError("STALE_OPERATION");
    }
    project([...operation, event], true);
    this.journal.push(structuredClone(event));
    if (failure === "after") throw new ProposalError("DURABLE_AUDIT_FAILURE");
    return structuredClone(event);
  }
}
