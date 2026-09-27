// Builds the Mac App Store package (npm run app:store): a universal (Apple silicon and
// Intel) app, sandboxed, signed with the App Store identity and its provisioning profile,
// wrapped in a signed installer package ready for App Store Connect. With an App Store
// Connect API key in the environment, it uploads it too.
//
// Needs, in this Mac's keychain: an "Apple Distribution" (or "3rd Party Mac Developer
// Application") certificate and a "3rd Party Mac Developer Installer" (Mac Installer
// Distribution) certificate. And the app's Mac App Store provisioning profile, at
// src-tauri/embedded.provisionprofile (kept out of git) or APP_STORE_PROFILE.
//
// Optional environment:
//   BUILD_NUMBER             CFBundleVersion; must increase with every upload (default: commit count)
//   APP_STORE_API_KEY_ID     with APP_STORE_API_ISSUER, uploads the package; the key file
//   APP_STORE_API_ISSUER     (AuthKey_<id>.p8) goes in ~/.appstoreconnect/private_keys/

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const APP = 'src-tauri/target/universal-apple-darwin/release/bundle/macos/Photobook Sequencer.app';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function identity(...kinds) {
  const list = execFileSync('security', ['find-identity', '-v'], { encoding: 'utf8' });
  for (const kind of kinds) {
    const match = list.match(new RegExp(`"(${kind}: [^"]+)"`));
    if (match) return match[1];
  }
  return null;
}

const appIdentity = identity('Apple Distribution', '3rd Party Mac Developer Application');
const installerIdentity = identity('3rd Party Mac Developer Installer', 'Mac Installer Distribution');
const profile = resolve(process.env.APP_STORE_PROFILE ?? 'src-tauri/embedded.provisionprofile');
const missing = [
  !appIdentity && '- an "Apple Distribution" certificate (Xcode → Settings → Accounts → Manage Certificates → +)',
  !installerIdentity && '- a "Mac Installer Distribution" certificate (same place)',
  !existsSync(profile) &&
    `- the Mac App Store provisioning profile for io.salem.PhotobookSequencer, at ${profile}\n` +
      '  (developer.apple.com → Profiles → + → Mac App Store Connect)',
].filter(Boolean);
if (missing.length) fail(`To build for the App Store, this Mac needs:\n${missing.join('\n')}`);

const team = appIdentity.match(/\(([A-Z0-9]{10})\)$/)?.[1];
if (!team) fail(`Couldn't find the team ID in "${appIdentity}".`);
const build =
  process.env.BUILD_NUMBER ?? execFileSync('git', ['rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim();

const work = mkdtempSync(join(tmpdir(), 'photobook-app-store-'));
try {
  // The sandbox entitlements, plus the identifiers the App Store requires alongside the profile.
  const entitlements = join(work, 'AppStore.entitlements');
  writeFileSync(
    entitlements,
    readFileSync('src-tauri/Entitlements.plist', 'utf8').replace(
      '</dict>',
      `  <key>com.apple.application-identifier</key>\n  <string>${team}.io.salem.PhotobookSequencer</string>\n` +
        `  <key>com.apple.developer.team-identifier</key>\n  <string>${team}</string>\n</dict>`,
    ),
  );
  const config = {
    bundle: {
      macOS: {
        signingIdentity: appIdentity,
        entitlements,
        bundleVersion: build,
        files: { 'embedded.provisionprofile': profile },
      },
    },
  };

  console.log(`Building Photobook Sequencer ${version} (${build}) for the App Store…`);
  const rust = spawnSync('rustup', ['target', 'add', 'x86_64-apple-darwin', 'aarch64-apple-darwin'], {
    stdio: 'inherit',
  });
  if (rust.status !== 0) fail('Couldn’t add the Rust targets for a universal build.');
  const tauri = spawnSync(
    'npx',
    ['tauri', 'build', '--bundles', 'app', '--target', 'universal-apple-darwin', '--config', JSON.stringify(config)],
    { stdio: 'inherit' },
  );
  if (tauri.status !== 0) fail('The app failed to build.');

  const verify = spawnSync('codesign', ['--verify', '--deep', '--strict', APP], { stdio: 'inherit' });
  if (verify.status !== 0) fail('The app’s signature doesn’t verify.');

  const pkg = `src-tauri/target/Photobook Sequencer ${version} (${build}).pkg`;
  const product = spawnSync('productbuild', ['--sign', installerIdentity, '--component', APP, '/Applications', pkg], {
    stdio: 'inherit',
  });
  if (product.status !== 0) fail('Couldn’t build the installer package.');
  console.log(`\nBuilt ${pkg}`);

  const { APP_STORE_API_KEY_ID: key, APP_STORE_API_ISSUER: issuer } = process.env;
  if (key && issuer) {
    console.log('Uploading to App Store Connect…');
    const upload = spawnSync(
      'xcrun',
      ['altool', '--upload-package', pkg, '--type', 'macos', '--apiKey', key, '--apiIssuer', issuer],
      { stdio: 'inherit' },
    );
    if (upload.status !== 0) fail('The upload failed.');
    console.log('Uploaded. It shows up in App Store Connect → TestFlight once Apple has processed it.');
  } else {
    console.log('To upload it: open it in Transporter, or set APP_STORE_API_KEY_ID and APP_STORE_API_ISSUER.');
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
