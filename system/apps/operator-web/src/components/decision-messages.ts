export function decisionConfirmationNotice(origin?: "mock"): string {
  return origin === "mock"
    ? "Demonstração: a decisão será simulada em memória e poderá ser perdida ao reiniciar. Nenhum registro real será alterado."
    : "A decisão será registrada com sua identidade autenticada.";
}

export function decisionSuccessMessage(action: "APPROVE" | "REJECT", item: string | number, origin?: "mock"): string {
  const decision = action === "APPROVE" ? "Aprovação" : "Rejeição";
  return origin === "mock"
    ? decision + " do item " + item + " simulada em memória. Sem persistência real."
    : decision + " do item " + item + " salva.";
}
