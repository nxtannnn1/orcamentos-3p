import { validateRejectionJustification } from "./rejection-justification";
import type { OperatorRepository } from "../repositories/operator-repository";
import type { BudgetItem, OfficialMaterial } from "../types/operator";
import {
  createReviewSession,
  moveSelection,
  selectItem,
  type ReviewSession,
} from "./review-session";

export class ReviewController {
  private current: ReviewSession = { items: [], selectedIndex: 0 };
  private saving = false;
  private reloadRequired = false;
  private unsavedChanges = false;
  setUnsavedChanges(value: boolean) { this.unsavedChanges = value; }
  requireReload() { this.reloadRequired = true; }
  constructor(private repository: OperatorRepository) {}
  get session() {
    return structuredClone(this.current);
  }
  async load(id: string) {
    if (this.saving) throw new Error("Aguarde a gravação em andamento.");
    this.current = createReviewSession(await this.repository.listItemsByBudget(id));
    this.reloadRequired = false;
    this.unsavedChanges = false;
    return this.session;
  }
  select(id: string) {
    if (!this.saving) this.current = selectItem(this.current, id);
    return this.session;
  }
  move(direction: -1 | 1) {
    if (!this.saving) this.current = moveSelection(this.current, direction);
    return this.session;
  }
  private async save(write: (id: string) => Promise<BudgetItem>, advance: boolean) {
    if (this.unsavedChanges) throw new Error("Salve ou descarte as correções locais antes de decidir.");
    if (this.saving) throw new Error("Aguarde a gravação em andamento.");
    if (this.reloadRequired) throw new Error("Releia os dados antes de tentar uma nova decisão.");
    const selected = this.current.items[this.current.selectedIndex];
    if (!selected) throw new Error("Selecione um item antes de decidir.");
    this.saving = true;
    try {
      const saved = await write(selected.id);
      this.current = {
        ...this.current,
        items: this.current.items.map((item) => (item.id === selected.id ? saved : item)),
      };
      if (advance) this.current = moveSelection(this.current, 1);
      return this.session;
    } catch (error) {
      // A timeout may have happened after persistence. Never resubmit blindly.
      this.reloadRequired = true;
      throw error;
    } finally {
      this.saving = false;
    }
  }
  async approveAndNext(material: OfficialMaterial | null, observation: string) {
    if (!material) throw new Error("Escolha explicitamente um Material Oficial antes de aprovar.");
    return this.save(
      (id) =>
        this.repository.saveItemDecision(
          id,
          { action: "APPROVE", approvedMaterial: material, observation },
          { version: this.current.items[this.current.selectedIndex]?.version },
        ),
      true,
    );
  }
  async reject(observation: string) {
    observation = validateRejectionJustification(observation);
    return this.save(
      (id) =>
        this.repository.saveItemDecision(
          id,
          { action: "REJECT", approvedMaterial: null, observation },
          { version: this.current.items[this.current.selectedIndex]?.version },
        ),
      false,
    );
  }
}
