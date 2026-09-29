// Sets the app's version everywhere it's recorded (npm run bump 0.1.2): package.json and
// package-lock.json, the Mac app's tauri.conf.json, and its Cargo.toml and Cargo.lock.
// It doesn't commit or tag. The Release workflow runs it, then commits, tags, and ships
// the version (see .github/workflows/release.yml).

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2]?.replace(/^v/, '');
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: npm run bump <version>, e.g. npm run bump 0.1.2');
  process.exit(1);
}
const current = JSON.parse(readFileSync('package.json', 'utf8')).version;

/** `file` with exactly one match of `pattern` replaced; fails (changing nothing) otherwise. */
function replaceOnce(file, pattern, replacement) {
  const text = readFileSync(file, 'utf8');
  const matches = text.match(new RegExp(pattern.source, `${pattern.flags}g`)) ?? [];
  if (matches.length !== 1) {
    console.error(`Expected one version in ${file}, found ${matches.length}. Nothing was changed.`);
    process.exit(1);
  }
  return [file, text.replace(pattern, replacement)];
}

// The app's own entry in Cargo.lock is under its crate's name, from Cargo.toml.
const crate = readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^name = "([^"]+)"/m)[1];
// Every change is worked out before any is written, so a surprise changes nothing.
const edits = [
  replaceOnce('src-tauri/tauri.conf.json', /^( {2}"version": )"[^"]+"/m, `$1"${version}"`),
  // The [package] section's version.
  replaceOnce('src-tauri/Cargo.toml', /^(\[package\][^[]*?\nversion = )"[^"]+"/, `$1"${version}"`),
  replaceOnce('src-tauri/Cargo.lock', new RegExp(`(\\nname = "${crate}"\\nversion = )"[^"]+"`), `$1"${version}"`),
];
// package.json and package-lock.json.
execFileSync('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], { stdio: 'ignore' });
for (const [file, text] of edits) writeFileSync(file, text);

console.log(`${current} → ${version}.`);
