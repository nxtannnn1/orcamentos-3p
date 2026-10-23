// Limited local evaluator for the expressions emitted by prepare-homologation.
// This is NOT the Power Automate engine and does not validate connector schemas.
export function evaluateExpression(expression, context = {}) {
  const source = expression.startsWith('@') ? expression.slice(1) : expression;
  let at = 0;
  const whitespace = () => { while (/\s/.test(source[at] ?? '') && at < source.length) at++; };
  const quoted = () => {
    if (source[at++] !== "'") throw new Error('Expected quote');
    let value = '';
    while (at < source.length) {
      const ch = source[at++];
      if (ch !== "'") { value += ch; continue; }
      if (source[at] === "'") { value += "'"; at++; } else return value;
    }
    throw new Error('Unclosed string');
  };
  const funcs = {
    body: name => context.bodies?.[name], outputs: name => context.outputs?.[name],
    triggerBody: () => context.trigger, triggerOutputs: () => ({ body: context.trigger }),
    parameters: name => context.parameters?.[name],
    string: value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value),
    coalesce: (...args) => args.find(x => x !== null && x !== undefined) ?? null,
    if: (condition, yes, no) => condition === true ? yes : no,
    equals: (a, b) => a === b, and: (...args) => args.every(x => x === true), or: (...args) => args.some(x => x === true),
    not: value => !value, empty: value => value == null || value === '' || Array.isArray(value) && !value.length,
    trim: value => { if (typeof value !== 'string') throw new Error('trim expects string'); return value.trim(); },
    toUpper: value => value.toUpperCase(), endsWith: (a, b) => a.endsWith(b),
    greater: (a, b) => { if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) throw new Error('greater expects numbers'); return a > b; },
    length: value => value.length, first: value => value[0], concat: (...args) => args.join(''),
    // Used by the Historico_Precos flow v2 (scripts/historico-precos-flow.mjs). Strict like the engine: wrong types throw.
    contains: (text, part) => { if (typeof text !== 'string') throw new Error('contains expects string'); return text.includes(part); },
    indexOf: (text, part) => text.indexOf(part), lastIndexOf: (text, part) => text.lastIndexOf(part),
    add: (a, b) => a + b,
    json: value => { if (typeof value !== 'string') throw new Error('json expects string'); return JSON.parse(value); },
    float: value => { const parsed = Number(value); if (value === '' || !Number.isFinite(parsed)) throw new Error('float expects number'); return parsed; },
  };
  const parse = () => {
    whitespace();
    let value;
    if (source[at] === "'") value = quoted();
    else {
      const token = /^[A-Za-z_][A-Za-z0-9_]*|^-?\d+(?:\.\d+)?/.exec(source.slice(at))?.[0];
      if (!token) throw new Error(`Unexpected expression token at ${at}`);
      at += token.length; whitespace();
      if (source[at] === '(') {
        at++; const args = []; whitespace();
        if (source[at] !== ')') {
          while (true) { args.push(parse()); whitespace(); if (source[at] !== ',') break; at++; }
        }
        if (source[at++] !== ')') throw new Error('Expected closing parenthesis');
        if (!funcs[token]) throw new Error(`Unsupported function ${token}`);
        value = funcs[token](...args);
      } else if (token === 'true' || token === 'false') value = token === 'true';
      else if (token === 'null') value = null;
      else if (/^-?\d/.test(token)) value = Number(token);
      else throw new Error(`Unexpected literal ${token}`);
    }
    while (true) {
      whitespace();
      if (source.slice(at, at + 2) === '?[') at += 2;
      else if (source[at] === '[') at++;
      else break;
      const key = quoted();
      if (source[at++] !== ']') throw new Error('Expected closing bracket');
      value = value != null && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : key.split('/').reduce((v, k) => v?.[k], value);
    }
    return value;
  };
  const result = parse(); whitespace();
  if (at !== source.length) throw new Error(`Trailing expression at ${at}`);
  return result;
}
