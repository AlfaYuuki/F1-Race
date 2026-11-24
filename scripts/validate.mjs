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

const modules = ['main.js','game.js','renderer.js','renderer2d.js','physics.js','track.js','opponents.js','controls.js','platform.js','audio.js','championship.js'];
for (const file of modules) {
  const path = resolve(root, 'js', file);
  await access(path);
  const source = await readFile(path, 'utf8');
  for (const match of source.matchAll(/from\s+['"](.+?)['"]/g)) {
    if (match[1].startsWith('.')) await access(resolve(dirname(path), match[1]));
  }
}
console.log(`Validated ${ids.length} unique HTML IDs, ${modules.length} JavaScript modules and all relative imports.`);
