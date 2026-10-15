"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  calculateMaterialPriceIndicators,
  calculateEstimatedTotalCents,
  consolidatePriceIndicators,
  parsePositiveQuantity,
} from "../domain/price-comparison";
import { priceComparisonBff } from "../repositories/bff/bff-price-comparison-repository";
import { operatorBff } from "../repositories/bff/bff-operator-repository";
import type { OfficialMaterial } from "../types/operator";
import type {
  EvaluatedPriceOffer,
  PriceComparisonResult,
  PriceOfferIssue,
} from "../types/price-comparison";
import {
  changePriceComparisonMaterial,
  changePriceComparisonQuantity,
  emptyPriceComparisonSelection,
  filterPriceComparisonMaterials,
  initialPriceComparisonSelection,
  selectPriceComparisonOffer,
  selectedOfferIdForMaterial,
  summarizePricePreselection,
} from "./price-comparison-state";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

const issueLabels: Record<PriceOfferIssue, string> = {
  MATERIAL_NOT_APPROVED: "Sem material aprovado",
  DIFFERENT_MATERIAL: "Material oficial diferente",
  INVALID_UNIT_PRICE: "Preço unitário inválido",
  INCOMPATIBLE_UNIT: "Unidade incompatível",
  SUPPLIER_MISSING: "Fornecedor não identificado",
  BUDGET_MISSING: "Orçamento não identificado",
};

function formattedPrice(entry: EvaluatedPriceOffer) {
  const value = entry.offer.unitPrice;
  return typeof value === "number" && Number.isFinite(value)
    ? money.format(value)
    : "Não informado";
}

function formattedDate(value: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? date.format(new Date(value))
    : "Não informada";
}

function formattedEstimatedTotal(
  entry: EvaluatedPriceOffer,
  quantity: ReturnType<typeof parsePositiveQuantity>,
) {
  if (!entry.eligible) return "—";
  const cents = calculateEstimatedTotalCents(entry.offer.unitPrice, quantity);
  return cents === null ? "—" : money.format(cents / 100);
}

function formattedCents(value: number | null) {
  return value === null ? "—" : money.format(value / 100);
}

function formattedPercentage(value: number | null) {
  return value === null ? "—" : `${(value / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function PriceComparisonWorkspace() {
  const [materials, setMaterials] = useState<OfficialMaterial[]>([]);
  const [selection, setSelection] = useState(emptyPriceComparisonSelection);
  const [result, setResult] = useState<PriceComparisonResult | null>(null);
  const [comparisons, setComparisons] = useState<Record<string, PriceComparisonResult>>({});
  const [materialQuery, setMaterialQuery] = useState("");
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [error, setError] = useState("");
  const offerRequest = useRef(0);
  const material = selection.material;
  const selectedOfferId = selectedOfferIdForMaterial(selection, material?.id);
  const quantityInput = material ? selection.quantityInputs[material.id] ?? "1" : "1";
  const quantity = useMemo(() => parsePositiveQuantity(quantityInput), [quantityInput]);
  const preselection = useMemo(
    () => summarizePricePreselection(materials, comparisons, selection),
    [materials, comparisons, selection],
  );
  const visibleMaterials = useMemo(
    () => filterPriceComparisonMaterials(materials, materialQuery),
    [materials, materialQuery],
  );
  const materialIndicators = useMemo(
    () => result
      ? calculateMaterialPriceIndicators(result, quantity, selectedOfferId)
      : null,
    [result, quantity, selectedOfferId],
  );
  const consolidatedIndicators = useMemo(() => consolidatePriceIndicators(
    materials.map((entry) => {
      const comparison = comparisons[entry.id];
      return comparison
        ? calculateMaterialPriceIndicators(
            comparison,
            parsePositiveQuantity(selection.quantityInputs[entry.id] ?? ""),
            selectedOfferIdForMaterial(selection, entry.id),
          )
        : calculateMaterialPriceIndicators(
            { material: entry, offers: [], lowestPrice: null, lowestOfferIds: [] },
            null,
            null,
          );
    }),
  ), [materials, comparisons, selection]);

  useEffect(() => {
    let active = true;
    Promise.all([
      operatorBff.listOfficialMaterials(),
      priceComparisonBff.getInitialComparison(),
    ])
      .then(async ([officialMaterials, initialComparison]) => {
        const remainingComparisons = await Promise.all(
          officialMaterials
            .filter((entry) => entry.id !== initialComparison.material.id)
            .map((entry) => priceComparisonBff.getComparison(entry.id)),
        );
        if (!active) return;
        const initialSelection = initialPriceComparisonSelection(
          officialMaterials,
          initialComparison,
        );
        setMaterials(officialMaterials);
        setSelection(initialSelection);
        setResult(initialSelection.material ? initialComparison : null);
        if (initialSelection.material) {
          setComparisons(Object.fromEntries(
            [initialComparison, ...remainingComparisons]
              .map((entry) => [entry.material.id, entry]),
          ));
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Não foi possível carregar os materiais.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingMaterials(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function chooseMaterial(nextMaterial: OfficialMaterial | null) {
    const requestId = ++offerRequest.current;
    setSelection((current) => changePriceComparisonMaterial(current, nextMaterial));
    setResult(null);
    setError("");
    setLoadingOffers(nextMaterial !== null);
    if (!nextMaterial) return;

    const cached = comparisons[nextMaterial.id];
    if (cached) {
      setResult(cached);
      setLoadingOffers(false);
      return;
    }

    priceComparisonBff
      .getComparison(nextMaterial.id)
      .then((data) => {
        if (offerRequest.current === requestId) {
          setResult(data);
          setComparisons((current) => ({ ...current, [data.material.id]: data }));
        }
      })
      .catch((cause: unknown) => {
        if (offerRequest.current === requestId) {
          setError(cause instanceof Error ? cause.message : "Não foi possível carregar as ofertas.");
        }
      })
      .finally(() => {
        if (offerRequest.current === requestId) setLoadingOffers(false);
      });
  }

  const selectedOffer = useMemo(
    () => result?.offers.find((entry) => entry.offer.id === selectedOfferId) ?? null,
    [result, selectedOfferId],
  );

  return (
    <main className="comparison-shell">
      <header className="comparison-heading">
        <div>
          <Link href="/">← Voltar para fila</Link>
          <p className="eyebrow">Demonstração isolada</p>
          <h1>Comparação de preços</h1>
          <p>Compare preços unitários mock de fornecedores explicitamente fictícios.</p>
        </div>
        <span className="demo-badge">Dados fictícios · sem persistência</span>
      </header>

      <section className="comparison-notice" role="note">
        O menor preço unitário não representa necessariamente o menor custo total de aquisição.
        O total estimado usa apenas quantidade × preço unitário; frete, impostos adicionais,
        prazos, descontos e outros custos comerciais não fazem parte desta demonstração.
      </section>

      <section className="material-browser" aria-labelledby="material-browser-title">
        <header>
          <div>
            <h2 id="material-browser-title">Materiais disponíveis</h2>
            <p>Navegue pelo catálogo mock ou filtre por código, descrição ou categoria.</p>
          </div>
          <label className="material-filter">
            <span>Buscar materiais</span>
            <input
              type="search"
              value={materialQuery}
              onChange={(event) => setMaterialQuery(event.target.value)}
              placeholder="Código, descrição ou categoria"
            />
          </label>
        </header>
        {loadingMaterials ? (
          <div className="comparison-empty">Carregando materiais...</div>
        ) : visibleMaterials.length === 0 ? (
          <div className="comparison-empty">Nenhum material corresponde ao filtro.</div>
        ) : (
          <div className="material-list">
            {visibleMaterials.map((entry) => {
              const comparison = comparisons[entry.id];
              const validOfferCount = comparison?.offers.filter((offer) => offer.eligible).length;
              const selected = selectedOfferIdForMaterial(selection, entry.id) !== null;
              const status = validOfferCount === undefined
                ? "Carregando ofertas"
                : validOfferCount === 0
                  ? "Sem ofertas válidas"
                  : selected
                    ? "Pré-selecionado"
                    : "Aguardando seleção";
              return (
                <button
                  type="button"
                  key={entry.id}
                  className={material?.id === entry.id ? "active" : ""}
                  aria-current={material?.id === entry.id ? "true" : undefined}
                  onClick={() => chooseMaterial(entry)}
                >
                  <span>
                    <strong>{entry.code}</strong>
                    <b>{entry.name}</b>
                    <small>{entry.family || "Categoria não informada"}</small>
                  </span>
                  <span className={`material-status ${selected ? "selected" : validOfferCount === 0 ? "unavailable" : ""}`.trim()}>
                    <strong>{validOfferCount ?? "—"} ofertas válidas</strong>
                    <small>{status}</small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="comparison-selector">
        <div>
          <label>Material oficial</label>
          <p>A comparação usa exclusivamente o ID do material aprovado, nunca a descrição.</p>
        </div>
        <div className="comparison-current-material">
          {material ? (
            <><strong>{material.code} · {material.name}</strong><small>{material.family}</small></>
          ) : (
            <span>Escolha um material na lista.</span>
          )}
        </div>
        <div className="comparison-quantity">
          <label htmlFor="comparison-quantity">Quantidade desejada</label>
          <input
            id="comparison-quantity"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={quantityInput}
            aria-invalid={quantity === null}
            aria-describedby={quantity === null ? "comparison-quantity-error" : undefined}
            onChange={(event) => setSelection((current) =>
              changePriceComparisonQuantity(current, event.target.value)
            )}
          />
          {quantity === null && (
            <small id="comparison-quantity-error">Informe uma quantidade positiva e válida.</small>
          )}
        </div>
      </section>

      {error && <div className="feedback" role="alert">{error}</div>}
      {!material && !error && (
        <div className="comparison-empty">Selecione um material oficial para consultar as ofertas mock.</div>
      )}
      {loadingOffers && <div className="comparison-empty">Comparando ofertas...</div>}

      {material && result && !loadingOffers && (
        <section className="comparison-card">
          <header>
            <div>
              <span>Material comparado</span>
              <strong>{result.material.code} · {result.material.name}</strong>
              <small>Unidade equivalente exigida: {result.material.unit || "não informada"}</small>
            </div>
            <div className="comparison-summary">
              <strong>{result.offers.filter((entry) => entry.eligible).length}</strong>
              <span>ofertas válidas</span>
            </div>
          </header>

          {result.offers.length === 0 ? (
            <div className="comparison-empty">Não há ofertas mock vinculadas a este material aprovado.</div>
          ) : (
            <div className="table-scroll">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Escolha</th>
                    <th>Fornecedor</th>
                    <th>Código material</th>
                    <th>Unidade</th>
                    <th>Preço unitário</th>
                    <th>Total estimado</th>
                    <th>Orçamento</th>
                    <th>Data</th>
                    <th>Validação</th>
                  </tr>
                </thead>
                <tbody>
                  {result.offers.map((entry) => (
                    <tr
                      key={entry.offer.id}
                      className={`${entry.isLowestPrice ? "lowest-offer" : ""} ${selectedOfferId === entry.offer.id ? "selected-offer" : ""}`.trim()}
                    >
                      <td>
                        <input
                          type="radio"
                          name="selected-offer"
                          aria-label={`Selecionar oferta de ${entry.offer.supplier ?? "fornecedor não informado"}`}
                          checked={selectedOfferId === entry.offer.id}
                          disabled={!entry.eligible}
                          onChange={() => setSelection((current) =>
                            selectPriceComparisonOffer(current, entry.offer.id)
                          )}
                        />
                      </td>
                      <td>{entry.offer.supplier ?? "Não informado"}</td>
                      <td>{result.material.code}</td>
                      <td>{entry.offer.unit?.trim() || "Não informada"}</td>
                      <td><strong>{formattedPrice(entry)}</strong></td>
                      <td><strong>{formattedEstimatedTotal(entry, quantity)}</strong></td>
                      <td>{entry.offer.budgetCode?.trim() || "Não informado"}</td>
                      <td>{formattedDate(entry.offer.budgetDate)}</td>
                      <td>
                        {entry.isLowestPrice && <span className="lowest-badge">Menor preço</span>}
                        {!entry.eligible && (
                          <span className="invalid-offer">
                            {entry.issues.map((issue) => issueLabels[issue]).join("; ")}
                          </span>
                        )}
                        {entry.eligible && !entry.isLowestPrice && <span className="valid-offer">Válida</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.offers.length > 0 && result.lowestPrice === null && (
            <div className="comparison-warning">Nenhuma oferta válida está disponível para comparação.</div>
          )}

          {materialIndicators && (
            <section className="material-indicators" aria-label="Indicadores financeiros do material">
              {quantity === null ? (
                <div className="comparison-warning">Informe uma quantidade válida para comparar custos totais.</div>
              ) : materialIndicators.validOfferCount === 0 ? (
                <div className="comparison-warning">Não há oferta válida e equivalente para calcular indicadores.</div>
              ) : (
                <>
                  <div><span>Menor custo comparável</span><strong>{formattedCents(materialIndicators.minimumTotalCents)}</strong></div>
                  <div><span>Maior custo comparável</span><strong>{formattedCents(materialIndicators.maximumTotalCents)}</strong></div>
                  <div><span>Diferença potencial</span><strong>{formattedCents(materialIndicators.potentialDifferenceCents)}</strong></div>
                  <div><span>Diferença sobre o maior</span><strong>{formattedPercentage(materialIndicators.potentialDifferenceBasisPoints)}</strong></div>
                  <div><span>Custo pré-selecionado</span><strong>{formattedCents(materialIndicators.selectedTotalCents)}</strong></div>
                  <div><span>Pré-selecionada acima do menor</span><strong>{formattedCents(materialIndicators.selectedVsMinimumCents)}</strong></div>
                  {materialIndicators.validOfferCount === 1 && (
                    <p>Oferta única comparável; não há base para indicar diferença potencial.</p>
                  )}
                </>
              )}
            </section>
          )}

          <footer className="comparison-selection" aria-live="polite">
            {selectedOffer ? (
              <>
                <span>Oferta escolhida localmente</span>
                <strong>
                  {selectedOffer.offer.supplier} · {formattedPrice(selectedOffer)} · total estimado {formattedEstimatedTotal(selectedOffer, quantity)}
                </strong>
                <small>Esta escolha não é salva e não altera a aprovação do material.</small>
              </>
            ) : (
              <span>Nenhuma oferta selecionada. Escolha manualmente qualquer oferta válida.</span>
            )}
          </footer>
        </section>
      )}

      <section className="economy-card" aria-labelledby="economy-title">
        <header>
          <div>
            <span>Comparação consolidada</span>
            <h2 id="economy-title">Indicadores de diferença potencial</h2>
            <p>Somente materiais com quantidade válida e ao menos uma oferta comparável.</p>
          </div>
          <strong>{consolidatedIndicators.coveredMaterialCount} de {materials.length} materiais cobertos</strong>
        </header>
        <div className="economy-grid">
          <div><span>Total mínimo comparável</span><strong>{formattedCents(consolidatedIndicators.minimumTotalCents)}</strong></div>
          <div><span>Total máximo comparável</span><strong>{formattedCents(consolidatedIndicators.maximumTotalCents)}</strong></div>
          <div><span>Diferença potencial</span><strong>{formattedCents(consolidatedIndicators.potentialDifferenceCents)}</strong></div>
          <div>
            <span>Total pré-selecionado comparável</span>
            <strong>{formattedCents(consolidatedIndicators.selectedTotalCents)}</strong>
            <small>{consolidatedIndicators.selectedCoveredMaterialCount} de {consolidatedIndicators.coveredMaterialCount} materiais cobertos selecionados</small>
          </div>
          <div>
            <span>Pré-selecionado acima do mínimo</span>
            <strong>{formattedCents(consolidatedIndicators.selectedVsMinimumCents)}</strong>
            <small>{consolidatedIndicators.selectedVsMinimumCents === null ? "Exige seleção para toda a cobertura comparável" : "Mesma cobertura do total mínimo"}</small>
          </div>
          <div><span>Materiais excluídos</span><strong>{consolidatedIndicators.excludedMaterialCount}</strong><small>Sem oferta comparável ou quantidade válida</small></div>
        </div>
        <footer>
          Diferenças são potenciais, não economia realizada. Frete, tributos adicionais e descontos não representados estão fora do cálculo.
        </footer>
      </section>

      <section className="preselection-card" aria-labelledby="preselection-title">
        <header>
          <div>
            <span>Resumo demonstrativo</span>
            <h2 id="preselection-title">Pré-seleção de ofertas</h2>
            <p>Escolhas locais do operador, agrupadas por material oficial.</p>
          </div>
          <div className="preselection-total">
            <span>Total geral estimado</span>
            <strong>{money.format(preselection.totalCents / 100)}</strong>
          </div>
        </header>

        {preselection.lines.length === 0 ? (
          <div className="comparison-empty">Nenhuma oferta foi selecionada manualmente.</div>
        ) : (
          <div className="table-scroll">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Material</th><th>Fornecedor</th><th>Código</th><th>Unidade</th>
                  <th>Quantidade</th><th>Preço unitário</th><th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {preselection.lines.map((line) => (
                  <tr key={line.material.id}>
                    <td><strong>{line.material.name}</strong></td>
                    <td>{line.offer.offer.supplier}</td>
                    <td>{line.material.code}</td>
                    <td>{line.offer.offer.unit}</td>
                    <td>{line.quantityInput}</td>
                    <td>{formattedPrice(line.offer)}</td>
                    <td><strong>{line.subtotalCents === null ? "—" : money.format(line.subtotalCents / 100)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="preselection-pending">
          <strong>{preselection.materialsWithoutSelection.length} materiais sem oferta selecionada</strong>
          <span>{preselection.materialsWithoutSelection.map((entry) => entry.code).join(", ") || "Nenhum"}</span>
        </div>
        <footer>
          Esta pré-seleção é demonstrativa. Não representa aprovação, pedido de compra
          ou compromisso comercial e não é persistida.
        </footer>
      </section>
    </main>
  );
}
