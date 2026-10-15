"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  calculateEstimatedTotalCents,
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
import { MaterialAutocomplete } from "./material-autocomplete";
import {
  changePriceComparisonMaterial,
  emptyPriceComparisonSelection,
  initialPriceComparisonSelection,
  selectPriceComparisonOffer,
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

export function PriceComparisonWorkspace() {
  const [materials, setMaterials] = useState<OfficialMaterial[]>([]);
  const [selection, setSelection] = useState(emptyPriceComparisonSelection);
  const [result, setResult] = useState<PriceComparisonResult | null>(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [error, setError] = useState("");
  const offerRequest = useRef(0);
  const material = selection.material;
  const selectedOfferId = selection.selectedOfferId;
  const quantity = useMemo(() => parsePositiveQuantity(quantityInput), [quantityInput]);

  useEffect(() => {
    let active = true;
    Promise.all([
      operatorBff.listOfficialMaterials(),
      priceComparisonBff.getInitialComparison(),
    ])
      .then(([officialMaterials, initialComparison]) => {
        if (!active) return;
        const initialSelection = initialPriceComparisonSelection(
          officialMaterials,
          initialComparison,
        );
        setMaterials(officialMaterials);
        setSelection(initialSelection);
        setResult(initialSelection.material ? initialComparison : null);
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
    setSelection(changePriceComparisonMaterial(nextMaterial));
    setResult(null);
    setError("");
    setLoadingOffers(nextMaterial !== null);
    if (!nextMaterial) return;

    priceComparisonBff
      .getComparison(nextMaterial.id)
      .then((data) => {
        if (offerRequest.current === requestId) setResult(data);
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

      <section className="comparison-selector">
        <div>
          <label>Material oficial</label>
          <p>A comparação usa exclusivamente o ID do material aprovado, nunca a descrição.</p>
        </div>
        {loadingMaterials ? (
          <span>Carregando materiais...</span>
        ) : (
          <MaterialAutocomplete materials={materials} value={material} onChange={chooseMaterial} />
        )}
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
            onChange={(event) => setQuantityInput(event.target.value)}
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
    </main>
  );
}
