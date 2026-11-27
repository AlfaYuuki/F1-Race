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
const requiredMenuControls = ['start-button','weekend-session-buttons','championship-button','garage-open','data-open','platform-change','grid-position','quick-race-laps'];
const missingMenuControls = requiredMenuControls.filter(id => !declared.has(id));
if (missingMenuControls.length) throw new Error(`Required menu controls are missing: ${missingMenuControls.join(', ')}`);
if (!declared.has('quick-race-laps') || !main.includes('quickRaceLapsSelect')) throw new Error('Quick Race lap selector is missing or not wired.');
for (let lap = 1; lap <= 10; lap++) if (!html.includes('value="' + lap + '"')) throw new Error('Quick Race lap selector is missing option ' + lap + '.');

const modules = ['graphics-effects.js','track-evolution.js','collision.js','race-start.js','main.js','game.js','renderer.js','renderer2d.js','physics.js','track.js','opponents.js','controls.js','platform.js','audio.js','championship.js','garage.js','weather.js','data-manager.js','race-engineer.js','ai-personalities.js','race-weekend.js','pit-strategy.js','timing.js'];
for (const file of modules) {
  const path = resolve(root, 'js', file);
  await access(path);
  const source = await readFile(path, 'utf8');
  for (const match of source.matchAll(/from\s+['"](.+?)['"]/g)) {
    if (match[1].startsWith('.')) await access(resolve(dirname(path), match[1]));
  }
}
if (!html.includes('V1.26.0') || !html.includes('major version 1, milestone 26, sub-milestone 0')) throw new Error('In-game semantic version label is missing or invalid.');
const serviceWorker = await readFile(resolve(root, 'sw.js'), 'utf8');
const pwa = await readFile(resolve(root, 'js/pwa.js'), 'utf8');
if (!serviceWorker.includes("const CACHE_NAME = 'the-f1-race-shell-v36'")) {
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
const graphicsSource = await readFile(resolve(root, 'js/graphics-effects.js'), 'utf8');
for (const feature of ['cameraProfile','suspensionOffset','createGraphicsEffects']) if (!graphicsSource.includes(feature)) throw new Error(`Graphics milestone feature is missing: ${feature}`);
const graphicsTests = await readFile(resolve(root, 'tests/graphics-effects.test.js'), 'utf8');
for (const feature of ['camera profile reacts','suspension travel','weather, tyre smoke and sparks']) if (!graphicsTests.includes(feature)) throw new Error(`Graphics regression test is missing: ${feature}`);
const aiSource = await readFile(resolve(root, 'js/opponents.js'), 'utf8');
for (const feature of ['RELATIONSHIPS','pitDecision','pressure','mistakeCooldown','overtakeTargetId','totalLaps']) {
  if (!aiSource.includes(feature)) throw new Error(`Advanced AI feature is missing: ${feature}`);
}
const aiTests = await readFile(resolve(root, 'tests/ai-personalities.test.js'), 'utf8');
for (const feature of ['AI pit decisions react','AI exposes pressure','neutralisation prevents passing']) {
  if (!aiTests.includes(feature)) throw new Error(`AI regression test is missing: ${feature}`);
}
console.log(`Validated ${ids.length} unique HTML IDs, ${modules.length} JavaScript modules, AI feature gates and all relative imports.`);
