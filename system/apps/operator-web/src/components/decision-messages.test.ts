import { describe, expect, it } from "vitest";
import { decisionConfirmationNotice, decisionSuccessMessage } from "./decision-messages";
describe("mensagens de decisão por origem", () => {
  it.each(["APPROVE", "REJECT"] as const)("%s não aparenta persistência real no mock", action => {
    expect(decisionConfirmationNotice("mock")).toContain("Nenhum registro real será alterado");
    expect(decisionSuccessMessage(action, 1, "mock")).toContain("Sem persistência real");
    expect(decisionSuccessMessage(action, 1, "mock")).not.toContain("salva");
  });
  it("mantém a confirmação autenticada para a fonte real", () => {
    expect(decisionConfirmationNotice()).toContain("identidade autenticada");
    expect(decisionSuccessMessage("APPROVE", 1)).toBe("Aprovação do item 1 salva.");
  });
});
