import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const main = await readFile(resolve(root, 'js/main.js'), 'utf8');
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error(`Duplicate HTML IDs: ${[...new Set(duplicates)].join(', ')}`);

const declared = new Set(ids);
const queried = [...main.matchAll(/querySelector\(['"]#([^'"]+)['"]\)/g)].map(match => match[1]);
const missing = [...new Set(queried)].filter(id => !declared.has(id));
if (missing.length) throw new Error(`main.js references missing HTML IDs: ${missing.join(', ')}`);

const modules = ['track-evolution.js','collision.js','race-start.js','main.js','game.js','renderer.js','renderer2d.js','physics.js','track.js','opponents.js','controls.js','platform.js','audio.js','championship.js','garage.js','weather.js','data-manager.js','race-engineer.js','ai-personalities.js','race-weekend.js','pit-strategy.js','timing.js'];
for (const file of modules) {
  const path = resolve(root, 'js', file);
  await access(path);
  const source = await readFile(path, 'utf8');
  for (const match of source.matchAll(/from\s+['"](.+?)['"]/g)) {
    if (match[1].startsWith('.')) await access(resolve(dirname(path), match[1]));
  }
}
const serviceWorker = await readFile(resolve(root, 'sw.js'), 'utf8');
const pwa = await readFile(resolve(root, 'js/pwa.js'), 'utf8');
if (!serviceWorker.includes("const CACHE_NAME = 'the-f1-race-shell-v25'")) {
  throw new Error('Service worker cache version is missing or invalid.');
}
if (!serviceWorker.includes("'./js/race-start.js'")) { throw new Error('The race start gate module is missing from the PWA app shell.'); }
if (!serviceWorker.includes("'./js/race-weekend.js'")) {
  throw new Error('The race weekend module is missing from the PWA app shell.');
}
if (!serviceWorker.includes("'./js/pit-strategy.js'")) { throw new Error('The pit strategy module is missing from the PWA app shell.'); }
if (!serviceWorker.includes("'./js/track-evolution.js'")) { throw new Error('The track evolution module is missing from the PWA app shell.'); }
if (!serviceWorker.includes("'./js/timing.js'")) {
  throw new Error('The live timing module is missing from the PWA app shell.');
}
for (const feature of ['registration.update()', 'SKIP_WAITING', 'controllerchange', 'hadController = hasController']) {
  if (!pwa.includes(feature)) throw new Error(`PWA update flow is missing: ${feature}`);
}
console.log(`Validated ${ids.length} unique HTML IDs, ${modules.length} JavaScript modules and all relative imports.`);
