import { mkdir, copyFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}dist`, { recursive: true });
await mkdir(`${root}assets/games/wdragon`, { recursive: true });
await copyFile(`${root}tools/wdragon_editor.js`, `${root}assets/games/wdragon/editor.js`);
// Published pages must request the matching editor implementation and stylesheet.
const version=createHash('sha256').update(await readFile(`${root}tools/wdragon_editor.js`)).update(await readFile(`${root}assets/games/wdragon/editor.css`)).digest('hex').slice(0,12);
const index=(await readFile(`${root}index.html`,'utf8')).replace(/assets\/games\/wdragon\/editor\.(js|css)(?:\?v=[a-f0-9]+)?/g,(_,extension)=>`assets/games/wdragon/editor.${extension}?v=${version}`);
await writeFile(`${root}index.html`,index);
for (const file of ['index.html', 'styles.css', 'app.js']) {
  await copyFile(`${root}${file}`, `${root}dist/${file}`);
}
await cp(`${root}assets`, `${root}dist/assets`, { recursive: true });
console.log('Static site built in dist/');
