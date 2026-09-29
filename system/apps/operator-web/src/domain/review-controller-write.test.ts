import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockOperatorRepository } from "../mocks/mock-operator-repository";
import { ReviewController } from "./review-controller";

afterEach(() => vi.restoreAllMocks());

describe("persistência de decisão no controller", () => {
  it.each(["approve", "reject"])("%s falha sem alterar item, progresso ou seleção", async (action) => {
    const repository = createMockOperatorRepository();
    const controller = new ReviewController(repository);
    const before = await controller.load("budget-demo-01");
    const material = (await repository.listOfficialMaterials())[0];
    vi.spyOn(repository, "saveItemDecision").mockRejectedValue(new Error("Sem permissão"));
    await expect(action === "approve" ? controller.approveAndNext(material, "Comentário") : controller.reject("Comentário"))
      .rejects.toThrow("Sem permissão");
    expect(controller.session).toEqual(before);
  });

  it("usa o item retornado pelo servidor e impede decisões e navegação concorrentes", async () => {
    const repository = createMockOperatorRepository();
    const controller = new ReviewController(repository);
    const before = await controller.load("budget-demo-01");
    const material = (await repository.listOfficialMaterials())[0];
    const saved = { ...before.items[before.selectedIndex], observation: "Resposta do servidor", reviewStatus: "APROVADO" as const, approvedMaterial: material };
    let finish!: (item: typeof saved) => void;
    const spy = vi.spyOn(repository, "saveItemDecision").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = controller.approveAndNext(material, "Cliente");
    expect(controller.move(1)).toEqual(before);
    expect(controller.select(before.items[before.selectedIndex + 1].id)).toEqual(before);
    await expect(controller.reject("Concorrente")).rejects.toThrow("Aguarde");
    expect(spy).toHaveBeenCalledTimes(1);
    finish(saved);
    const after = await pending;
    expect(after.items[before.selectedIndex]).toEqual(saved);
    expect(after.selectedIndex).toBe(before.selectedIndex + 1);
  });
});
