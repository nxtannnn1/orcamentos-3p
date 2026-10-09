"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { operatorBff } from "../repositories/bff/bff-operator-repository";
import type { Budget } from "../types/operator";

const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export function BudgetQueue() {
  const [data, setData] = useState<Budget[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void operatorBff
      .listBudgets()
      .then(setData)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar a fila.",
        ),
      );
  }, []);

  return (
    <main className="page-shell">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Operação</p>
          <h1>Fila de orçamentos</h1>
          <p>{data.some(budget => budget.readOnly) ? "Selecione um orçamento para consultar seus itens." : "Selecione um orçamento para revisar seus itens e registrar decisões."}</p>
        </div>

        <div className="queue-summary">
          <strong>{data.length}</strong>
          <span>em revisão</span>
        </div>
      </section>

      {error ? (
        <div className="feedback">{error}</div>
      ) : (
        <section className="queue-card">
          <div className="queue-toolbar">
            <div>
              <strong>Orçamentos ativos</strong>
              <span>Dados fornecidos pela API interna do operator-web</span>
            </div>
            <em>Fonte server-side</em>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Orçamento</th>
                  <th>Fornecedor</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Itens</th>
                  <th>Progresso</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {data.map((budget) => {
                  const progress =
                    budget.itemCount > 0
                      ? Math.round(
                          (budget.reviewedCount / budget.itemCount) * 100,
                        )
                      : 0;

                  return (
                    <tr key={budget.id}>
                      <td>
                        <strong>{budget.code}</strong>
                        <small>Nº {budget.number}</small>
                      </td>

                      <td>{budget.supplier ?? "Não informado"}</td>

                      <td>{budget.date && Number.isFinite(Date.parse(budget.date)) ? fmt.format(new Date(budget.date)) : "Não informada"}</td>

                      <td>
                        <span className="budget-status">{budget.readOnly ? "Somente consulta" : "Em revisão"}</span>
                      </td>

                      <td>{budget.itemCount}</td>

                      <td className="progress-cell">
                        <div>
                          <span>
                            {budget.reviewAvailable === false ? "Revisão indisponível" : `${budget.reviewedCount} de ${budget.itemCount}`}
                          </span>
                          {budget.reviewAvailable !== false && <strong>{progress}%</strong>}
                        </div>

                        {budget.reviewAvailable !== false && <progress max="100" value={progress} />}
                      </td>

                      <td>
                        <Link
                          href={`/orcamentos/${budget.id}`}
                          className="open-link"
                        >
                          Abrir →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
