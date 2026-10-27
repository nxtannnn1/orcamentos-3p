// Test-only: minimal n8n executor (Code/IF/HTTP/trigger nodes used by the bridge) and an in-memory Graph.
// It checks wiring, expressions and pairing offline; it does not replace a run in a real n8n instance.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export async function runWorkflow(workflow, startNode, input, graph) {
  const byName = Object.fromEntries(workflow.nodes.map(n => [n.name, n]));
  const runData = {};
  const executed = [];
  const $ = (itemIndex = 0) => name => {
    const items = runData[name];
    if (!items) throw new Error(`Referenced node is unexecuted: ${name}`);
    return { first: () => items[0], all: () => items, item: items[Math.min(itemIndex, items.length - 1)] };
  };
  const evaluate = (value, json, index) => {
    if (typeof value !== 'string' || !value.startsWith('=')) return value;
    const tpl = value.slice(1);
    const run = expr => new Function('$json', '$', '$itemIndex', `return (${expr});`)(json, $(index), index);
    const single = tpl.match(/^\{\{([\s\S]*)\}\}$/);
    if (single && tpl.split('{{').length === 2) return run(single[1]);
    return tpl.replace(/\{\{([\s\S]+?)\}\}/g, (_, expr) => String(run(expr)));
  };
  async function http(node, item, index) {
    const p = node.parameters;
    const req = { method: p.method ?? 'GET', url: evaluate(p.url, item.json, index), query: {}, headers: {}, body: undefined };
    if (p.sendQuery) for (const q of p.queryParameters.parameters) req.query[q.name] = String(evaluate(q.value, item.json, index));
    if (p.sendHeaders) for (const h of p.headerParameters.parameters) req.headers[h.name] = String(evaluate(h.value, item.json, index));
    if (p.sendBody) req.body = structuredClone(evaluate(p.jsonBody, item.json, index));
    const tries = node.retryOnFail ? node.maxTries ?? 3 : 1;
    for (let attempt = 1; ; attempt++) {
      try {
        const res = graph.request(req);
        return { json: { statusCode: res.statusCode, headers: res.headers ?? {}, body: res.body }, pairedItem: { item: index } };
      } catch (error) {
        if (attempt < tries) continue;
        if (node.onError === 'continueRegularOutput') return { json: { error: { message: error.message } }, pairedItem: { item: index } };
        throw error;
      }
    }
  }
  async function execute(name, items) {
    const node = byName[name];
    executed.push(name);
    const type = node.type.replace('n8n-nodes-base.', '');
    let outputs;
    if (type === 'executeWorkflowTrigger' || type === 'manualTrigger') outputs = [items];
    else if (type === 'code') {
      const $input = { all: () => items, first: () => items[0] };
      const result = await new AsyncFunction('$input', '$', node.parameters.jsCode)($input, $(0));
      if (!Array.isArray(result)) throw new Error(`${name}: Code node must return an array`);
      outputs = [result.map(r => ({ json: structuredClone(r.json), pairedItem: r.pairedItem }))];
    } else if (type === 'if') {
      const [t, f] = [[], []];
      items.forEach((item, i) => (evaluate(node.parameters.conditions.conditions[0].leftValue, item.json, i) === true ? t : f).push(item));
      outputs = [t, f];
    } else if (type === 'httpRequest') {
      outputs = [[]];
      for (const [i, item] of items.entries()) outputs[0].push(await http(node, item, i));
    } else throw new Error(`Unsupported node type ${type}`);
    runData[name] = outputs[0].length ? outputs[0] : outputs.flat();
    const edges = workflow.connections[name]?.main ?? [];
    for (const [out, branch] of edges.entries()) {
      if (!outputs[out]?.length) continue;
      for (const edge of branch) await execute(edge.node, outputs[out]);
    }
  }
  await execute(startNode, input.map(json => ({ json })));
  return { runData, executed, output: runData['SAIDA - Relatório']?.map(i => i.json) ?? [] };
}

const BASE = 'https://graph.microsoft.com/v1.0';

export function mockGraph({ site = 'SYN-SITE', lists = {}, unique = {} } = {}) {
  const state = Object.fromEntries(Object.entries(lists).map(([list, rows]) => [list, new Map(rows.map(r => [String(r.id), structuredClone(r)]))]));
  const seq = Object.fromEntries(Object.keys(lists).map(list => [list, 1000]));
  const calls = [];
  const rules = [];
  const visible = row => ({ id: row.id, eTag: row.eTag,
    fields: Object.fromEntries(Object.entries(row.fields).filter(([, v]) => v !== null && v !== undefined && v !== '')) });
  const bump = row => { const [tag, n] = row.eTag.replace(/"/g, '').split(','); row.eTag = `"${tag},${Number(n) + 1}"`; };
  function matches(filter, fields) {
    return filter.split(' or ').some(clause => {
      const m = clause.match(/^fields\/(\w+) eq '((?:[^']|'')*)'$/);
      if (!m) throw Object.assign(new Error('bad filter'), { status: 400 });
      return String(fields[m[1]] ?? '').trim() === m[2].replace(/''/g, "'");
    });
  }
  function handle(req) {
    const path = req.url.startsWith(BASE) ? req.url.slice(BASE.length) : null;
    const m = path?.match(/^\/sites\/([^/]+)\/lists\/([^/]+)\/items(?:\/(\d+))?(\/fields)?$/);
    if (!m || m[1] !== site || !state[m[2]]) return { statusCode: 404, body: { error: { code: 'itemNotFound' } } };
    const [, , list, itemId, fieldsPath] = m;
    const rows = state[list];
    if (req.method === 'GET' && !itemId) {
      let found;
      try { found = [...rows.values()].filter(r => !req.query.$filter || matches(req.query.$filter, r.fields)); }
      catch (e) { return { statusCode: e.status ?? 500, body: { error: { code: 'invalidRequest' } } }; }
      const top = Number(req.query.$top ?? 200);
      const body = { value: found.slice(0, top).map(visible) };
      if (found.length > top) body['@odata.nextLink'] = 'synthetic-next-page';
      return { statusCode: 200, body };
    }
    const row = itemId && rows.get(itemId);
    if (req.method === 'GET') return row ? { statusCode: 200, body: visible(row) } : { statusCode: 404, body: { error: { code: 'itemNotFound' } } };
    if (req.method === 'POST' && !itemId) {
      const fields = req.body?.fields ?? {};
      for (const key of unique[list] ?? []) {
        if (fields[key] && [...rows.values()].some(r => r.fields[key] === fields[key])) return { statusCode: 409, body: { error: { code: 'nameAlreadyExists' } } };
      }
      const created = { id: String(++seq[list]), eTag: `"syn-${list}-${seq[list]},1"`, fields: structuredClone(fields) };
      rows.set(created.id, created);
      return { statusCode: 201, body: visible(created) };
    }
    if (req.method === 'PATCH' && row && fieldsPath) {
      if (!req.headers['If-Match'] || req.headers['If-Match'] === '*') return { statusCode: 428, body: { error: { code: 'preconditionRequired' } } };
      if (req.headers['If-Match'] !== row.eTag) return { statusCode: 412, body: { error: { code: 'resourceModified' } } };
      Object.assign(row.fields, req.body);
      bump(row);
      return { statusCode: 200, body: visible(row).fields };
    }
    return { statusCode: 400, body: { error: { code: 'invalidRequest' } } };
  }
  return {
    calls, state,
    // rule: { method, url (RegExp), status?, throwBefore?, throwAfter?, before?(state), times? }
    on(rule) { rules.push({ times: Infinity, ...rule }); return this; },
    request(req) {
      calls.push({ method: req.method, url: req.url, query: req.query, headers: req.headers, body: req.body });
      const rule = rules.find(r => r.times > 0 && (!r.method || r.method === req.method) && (!r.url || r.url.test(req.url)));
      if (rule) {
        rule.times--;
        rule.before?.(state);
        if (rule.throwBefore) throw new Error('synthetic transport failure');
        if (rule.status) return { statusCode: rule.status, headers: rule.status === 429 ? { 'retry-after': '5' } : {}, body: { error: { code: 'synthetic' } } };
      }
      const res = handle(req);
      if (rule?.throwAfter) throw new Error('synthetic lost response');
      return res;
    },
    writes() { return calls.filter(c => c.method !== 'GET'); }
  };
}
