import { mkdir, copyFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}dist`, { recursive: true });
await mkdir(`${root}assets/games/wdragon`, { recursive: true });
await copyFile(`${root}tools/wdragon_editor.js`, `${root}assets/games/wdragon/editor.js`);
for (const file of ['index.html', 'styles.css', 'app.js']) {
  await copyFile(`${root}${file}`, `${root}dist/${file}`);
}
await cp(`${root}assets`, `${root}dist/assets`, { recursive: true });
console.log('Static site built in dist/');
