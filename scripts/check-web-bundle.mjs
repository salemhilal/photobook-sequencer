// Fails if the website's build (dist/) contains any of the Mac app's code. The app's
// code is reachable only from its own build (see src/platform/); this makes sure it stays that way.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MARKERS = ['@tauri-apps', '__TAURI', 'plugin:dialog', 'begin_save', 'take_opened_files'];
const dir = 'dist/assets';
const leaks = readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .flatMap((f) => {
    const code = readFileSync(join(dir, f), 'utf8');
    return MARKERS.filter((m) => code.includes(m)).map((m) => `${f}: ${m}`);
  });

if (leaks.length) {
  console.error(`The website's build contains Mac app code:\n  ${leaks.join('\n  ')}`);
  process.exit(1);
}
console.log('The website build has none of the Mac app’s code.');
