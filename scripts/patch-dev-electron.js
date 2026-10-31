// patch-dev-electron.js: make the development Electron.app able to hear the system.
//
// macOS gates Core Audio taps behind NSAudioCaptureUsageDescription and charges
// the permission to the "responsible" process. Without the key, Chromium hands
// back an audio track that is already ended, with no error. So the dev bundle
// gets the keys and its own identity, and `npm start` launches it with `open` so
// that it, rather than whichever terminal ran the command, is the app asking.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

if (process.platform !== 'darwin') process.exit(0);

// node-pty's prebuilt helper unpacks without its executable bit, and spawning fails without it.
fs.chmodSync(path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds', `darwin-${process.arch}`, 'spawn-helper'), 0o755);

const app = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app');
const plist = path.join(app, 'Contents', 'Info.plist');

function set(key, value) {
  const buddy = (cmd) => execFileSync('/usr/libexec/PlistBuddy', ['-c', cmd, plist], { stdio: 'pipe' });
  try { buddy(`Set :${key} ${value}`); } catch { buddy(`Add :${key} string ${value}`); }
}

set('CFBundleIdentifier', 'com.sotto.dev');
set('CFBundleName', 'Sotto');
set('CFBundleDisplayName', 'Sotto');
set('NSAudioCaptureUsageDescription', 'Sotto listens to the other side of your call to take notes for you.');
set('NSMicrophoneUsageDescription', 'Sotto listens to your side of the call to take notes for you.');
// Editing the plist breaks the bundle's signature; ad-hoc is enough to run locally.
execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'pipe' });
console.log('Patched development Electron.app for system audio capture');
