// End-to-end test of the Mac app's projects (npm run test:app). Makes fixture
// projects, runs a test build of the real app on them (see src/platform/macos/e2e.ts), then checks
// the files it saved from outside the app too.
//
// The test build keeps its storage apart from the real app's and the dev build's,
// and it's deleted afterwards. Its window shows for a few seconds while it runs.

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createZip, readZip } from '../src/zip.ts';

const ID = 'io.salem.PhotobookSequencer.e2e';
// Run outside an app bundle, WebKit keeps the app's storage under the executable's name,
// so the test runs a copy under a name of its own (not the dev build's).
const EXE = 'photobook-sequencer-e2e';
// Its own build folder, so switching between it and the real app doesn't rebuild everything.
const TARGET = resolve('src-tauri/target/e2e');
const TIMEOUT_MS = 120_000;
const storage = [join(homedir(), 'Library/WebKit', EXE), join(homedir(), 'Library/Caches', EXE)];
const forget = () => storage.forEach((p) => rmSync(p, { recursive: true, force: true }));

function fixture(names) {
  const photos = {};
  const files = {};
  const entries = [];
  const spreads = ['first', 'middle', 'middle', 'last'].map((kind, i) => ({ id: `s${i}`, kind, items: [] }));
  const pile = [];
  names.forEach((name, i) => {
    const id = `p${i}`;
    photos[id] = { id, name: `${name}.jpg`, pxW: 795, pxH: 1200 };
    files[id] = { image: `images/${name}.jpg` };
    entries.push({ name: `images/${name}.jpg`, data: new Blob([readFileSync(`src/tour/${name}.jpg`)]) });
    const at = { photoId: id, w: 1.325, h: 2, z: i + 1 };
    if (i === 0) pile.push({ ...at, x: 1, y: 1 });
    else spreads[1].items.push({ ...at, x: i === 1 ? -6 : 2, y: 2 });
  });
  const doc = {
    schemaVersion: 1,
    photos,
    pile,
    spreads,
    settings: { pageW: 10, pageH: 8, centerV: true, centerH: true, keepRelative: true, borders: [0.5, 1.25] },
    nextZ: names.length + 1,
  };
  const manifest = { format: 'photo-sequencer-project', version: 1, exportedAt: '', doc, files };
  return createZip([{ name: 'project.json', data: new Blob([JSON.stringify(manifest)]) }, ...entries]);
}

async function savedDoc(path) {
  const zip = await readZip(new Blob([readFileSync(path)]));
  return JSON.parse(await (await zip.get('project.json').blob()).text()).doc;
}

const dir = mkdtempSync(join(tmpdir(), 'photobook-e2e-'));
let failed = false;
try {
  writeFileSync(
    join(dir, 'Fixture A.photo-sequence'),
    Buffer.from(await (await fixture(['taxi', 'lily', 'door'])).arrayBuffer()),
  );
  writeFileSync(join(dir, 'Fixture B.photo-sequence'), Buffer.from(await (await fixture(['leaves'])).arrayBuffer()));

  console.log('Building the test app…');
  const build = spawnSync(
    'npx',
    ['tauri', 'build', '--no-bundle', '--features', 'e2e', '--config', JSON.stringify({ identifier: ID })],
    { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, PBS_E2E_BUILD: '1', CARGO_TARGET_DIR: TARGET } },
  );
  if (build.status !== 0) throw new Error('The test app failed to build.');
  copyFileSync(join(TARGET, 'release/photobook-sequencer'), join(TARGET, 'release', EXE));

  forget();
  const run = async () => {
    const app = spawn(join(TARGET, 'release', EXE), { env: { ...process.env, PBS_E2E: dir } });
    let output = '';
    app.stdout.on('data', (d) => (output += d));
    const timer = setTimeout(() => app.kill(), TIMEOUT_MS);
    const code = await new Promise((resolve) => app.on('exit', resolve));
    clearTimeout(timer);
    console.log(output.trim() || '(no report)');
    if (code === null) console.log(`FAIL finishes within ${TIMEOUT_MS / 1000} s`);
    if (code !== 0) failed = true;
  };
  console.log('Running…\n');
  await run();
  // Quit and start again: the app should pick up where it left off.
  writeFileSync(join(dir, 'relaunch'), '');
  console.log('\nRelaunching…\n');
  await run();

  // What the app stored: each photo on its own, never a copy of a whole project file.
  const projects = ['Fixture A', 'Fixture B'].map((f) => statSync(join(dir, `${f}.photo-sequence`)).size);
  const stored = readdirSync(storage[0], { recursive: true })
    .filter((f) => f.endsWith('.blob'))
    .map((f) => statSync(join(storage[0], f)).size);
  const own = stored.length > 0 && !stored.some((size) => projects.includes(size));
  console.log(`${own ? 'ok  ' : 'FAIL'} stores each photo on its own, not a copy of the project file`);
  if (!own) failed = true;

  // The saved files, read from outside the app.
  const outside = [
    [
      'saved file has the change (read outside the app)',
      (await savedDoc(join(dir, 'Fixture A.photo-sequence'))).settings.pageW === 11,
    ],
    [
      'saved-as file has the change (read outside the app)',
      (await savedDoc(join(dir, 'Saved As.photo-sequence'))).settings.pageW === 12,
    ],
  ];
  for (const [name, ok] of outside) {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
    if (!ok) failed = true;
  }
} catch (e) {
  console.error(`FAIL ${e.message}`);
  failed = true;
} finally {
  forget();
  rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? '\nThe Mac app end-to-end test failed.' : '\nThe Mac app end-to-end test passed.');
process.exit(failed ? 1 : 0);
