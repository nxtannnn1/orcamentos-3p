import { describe, expect, it, vi } from "vitest";
import { ReviewController } from "./review-controller";
import { createMockOperatorRepository } from "../mocks/mock-operator-repository";

describe("recuperação após decisão incerta", () => {
  it("bloqueia repetição mesmo após navegar e somente desbloqueia com leitura bem sucedida", async () => {
    const repository = createMockOperatorRepository();
    const save = vi.spyOn(repository, "saveItemDecision").mockRejectedValueOnce(new Error("Resultado não confirmado"));
    const controller = new ReviewController(repository);
    await controller.load("budget-demo-01");
    await expect(controller.reject("Synthetic reason")).rejects.toThrow("não confirmado");
    controller.move(1);
    await expect(controller.reject("Synthetic reason")).rejects.toThrow("Releia");
    const read = vi.spyOn(repository, "listItemsByBudget").mockRejectedValueOnce(new Error("Leitura indisponível"));
    await expect(controller.load("budget-demo-01")).rejects.toThrow("Leitura");
    await expect(controller.reject("Synthetic reason")).rejects.toThrow("Releia");
    expect(save).toHaveBeenCalledTimes(1);
    read.mockRestore();
    await controller.load("budget-demo-01");
    await controller.reject("Synthetic reason");
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("bloqueia cliques simultâneos e releitura durante gravação", async () => {
    const repository = createMockOperatorRepository();
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const original = repository.saveItemDecision.bind(repository);
    vi.spyOn(repository, "saveItemDecision").mockImplementation(async (...args) => { await wait; return original(...args); });
    const controller = new ReviewController(repository);
    await controller.load("budget-demo-01");
    const first = controller.reject("Synthetic reason");
    await expect(controller.reject("Synthetic reason")).rejects.toThrow("Aguarde");
    await expect(controller.load("budget-demo-01")).rejects.toThrow("Aguarde");
    release();
    await first;
    expect(repository.saveItemDecision).toHaveBeenCalledTimes(1);
  });
});
