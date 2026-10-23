// Builds a LOCAL, filled copy of the PBIP (real site/list parameters) OUTSIDE the repository.
// List IDs come from operator-web/.env.local (never versioned); the site URL is passed explicitly.
// Usage: node system/analytics/powerbi/preparar-copia-local.mjs --site-url https://<tenant>.sharepoint.com/sites/<site> --destino <pasta fora do repo>
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, PROJECT } from './gerar-pbip.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const siteUrl = arg('--site-url');
const destino = arg('--destino');
const site = /^(https:\/\/[a-z0-9-]+\.sharepoint\.com)\/(sites\/[^/?#]+)\/?$/i.exec(siteUrl ?? '');
if (!site) throw new Error('Informe --site-url https://<tenant>.sharepoint.com/sites/<site>.');
if (!destino) throw new Error('Informe --destino (pasta fora do repositório).');
const alvo = path.resolve(destino, PROJECT);
if (!path.relative(repo, alvo).startsWith('..')) throw new Error('O destino precisa ficar FORA do repositório (a cópia contém IDs reais).');

const env = Object.fromEntries(readFileSync(path.join(repo, 'system/apps/operator-web/.env.local'), 'utf8').split(/\r?\n/)
  .map(line => /^([A-Z0-9_]+)=(.*)$/.exec(line)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^['"]|['"]$/g, '').trim()]));
const guid = name => {
  const value = (env[name] ?? '').replace(/[{}]/g, '').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) throw new Error(`${name} ausente ou inválido no .env.local.`);
  return value;
};
console.log(build(alvo, {
  SharePointRaiz: site[1].toLowerCase(),
  SiteCaminho: site[2],
  ListaItensId: guid('SHAREPOINT_ITENS_IMPORTADOS_LIST_ID'),
  ListaOrcamentosId: guid('SHAREPOINT_ORCAMENTOS_LIST_ID'),
  ListaMateriaisId: guid('SHAREPOINT_MATERIAIS_OFICIAIS_LIST_ID'),
  ListaHistoricoId: guid('SHAREPOINT_HISTORICO_PRECOS_LIST_ID'),
}));
