import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PriceComparisonWorkspace } from "./price-comparison-workspace";

describe("apresentação da comparação", () => {
  it("identifica simulação, ausência de persistência e carregamento acessível", () => {
    const html = renderToStaticMarkup(<PriceComparisonWorkspace source="mock" />);
    expect(html).toContain("Dados fictícios · sem persistência");
    expect(html).toContain("Todos os valores e diferenças exibidos nesta demonstração são fictícios.");
    expect(html).toContain('role="status"');
    expect(html).toContain("Total estimado das ofertas selecionadas");
  });
  it("distingue consulta real de histórico e estimativa comercial", () => {
    const html = renderToStaticMarkup(<PriceComparisonWorkspace source="sharepoint" />);
    expect(html).toContain("Dados SharePoint · consulta somente leitura");
    expect(html).toContain("não consulta nem grava Historico_Precos");
    expect(html).toContain("não comprova a validade comercial");
    expect(html).not.toContain("Todos os valores e diferenças exibidos nesta demonstração são fictícios.");
  });
});
