import { ErroContrato } from "./validar-orcamento";

export type IdentificacaoFornecedor = { tipo: "cnpj"; valor: string } |
  { tipo: "externa"; sistema: string; escopo: string; id: string };

export function objetoEstrito(valor: unknown, campo: string, chaves: string[]): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(valor)))
    throw new ErroContrato(campo, "OBJETO_OBRIGATORIO");
  for (const chave of Object.keys(valor)) if (!chaves.includes(chave))
    throw new ErroContrato(`${campo}.${chave}`, "CAMPO_DESCONHECIDO");
  return valor as Record<string, unknown>;
}
export function textoEstrito(valor: unknown, campo: string, max = 255): string {
  if (typeof valor !== "string" || !valor.trim() || valor !== valor.trim() ||
      [...valor].length > max || /[\u0000-\u001f\u007f]/u.test(valor))
    throw new ErroContrato(campo, "TEXTO_INVALIDO");
  return valor;
}

/** Receita Federal: caracteres ASCII menos 48, pesos cíclicos de 2 a 9. */
export function cnpjValido(valor: unknown): valor is string {
  if (typeof valor !== "string" || !/^[A-Z0-9]{12}[0-9]{2}$/.test(valor) || /^([0-9])\1{13}$/.test(valor)) return false;
  function dv(base: string): string {
    let soma = 0;
    for (let i = base.length - 1, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1)
      soma += (base.charCodeAt(i) - 48) * peso;
    const resto = soma % 11;
    return String(resto < 2 ? 0 : 11 - resto);
  }
  const base = valor.slice(0, 12), primeiro = dv(base);
  return valor.slice(12) === primeiro + dv(base + primeiro);
}

export function validarIdentificacaoFornecedor(entrada: unknown): IdentificacaoFornecedor {
  const campo = "fornecedor.identificacao";
  const o = objetoEstrito(entrada, campo, ["tipo", "valor", "sistema", "escopo", "id"]);
  if (o.tipo === "cnpj") {
    objetoEstrito(o, campo, ["tipo", "valor"]);
    if (!cnpjValido(o.valor)) throw new ErroContrato(`${campo}.valor`, "CNPJ_INVALIDO");
    return { tipo: "cnpj", valor: o.valor };
  }
  if (o.tipo === "externa") {
    objetoEstrito(o, campo, ["tipo", "sistema", "escopo", "id"]);
    return { tipo: "externa", sistema: textoEstrito(o.sistema, `${campo}.sistema`),
      escopo: textoEstrito(o.escopo, `${campo}.escopo`), id: textoEstrito(o.id, `${campo}.id`) };
  }
  throw new ErroContrato(`${campo}.tipo`, "IDENTIFICACAO_INVALIDA");
}

export function chaveFornecedor(entrada: unknown): string {
  const i = validarIdentificacaoFornecedor(entrada);
  // Tuplas JSON não colidem quando identificadores contêm separadores.
  return JSON.stringify(i.tipo === "cnpj" ? [i.tipo, i.valor] : [i.tipo, i.sistema, i.escopo, i.id]);
}
export interface RegistroFornecedor {
  fornecedorId: string;
  ativo: boolean;
  identificacao: IdentificacaoFornecedor;
}
/** Catálogo confiável, previamente limitado ao tenant/fonte pelo chamador; não autoriza acesso. */
export function resolverFornecedor(entrada: unknown, catalogo: readonly RegistroFornecedor[]): string {
  const chave = chaveFornecedor(entrada);
  const encontrados = catalogo.filter(r => chaveFornecedor(r.identificacao) === chave);
  if (encontrados.length > 1) throw new ErroContrato("fornecedor.identificacao", "SUPPLIER_AMBIGUOUS");
  if (encontrados.length === 0 || !encontrados[0].ativo)
    throw new ErroContrato("fornecedor.identificacao", "SUPPLIER_UNRESOLVED");
  return textoEstrito(encontrados[0].fornecedorId, "catalogo.fornecedorId");
}
