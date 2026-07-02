// ---------------------------------------------------------------------------
// scripts/zip.mjs
// Builds a Chrome Web Store-ready zip:
//   - Runs `vite build` first
//   - Strips the `key` field from manifest.json (causes upload errors if mismatched)
//   - Zips only the files Chrome needs: manifest.json, popup.html, dist/, icons/
// ---------------------------------------------------------------------------

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { createGzip } from 'zlib';

// Use the built-in archiver via JSZip — no extra deps needed since we can use
// the native zip command on Mac/Linux or PowerShell on Windows.

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const outFile = path.join(ROOT, `mentro-${version}.zip`);

// 1. Build
console.log('Building…');
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });

// 2. Strip key from manifest
console.log('Stripping key from manifest…');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
delete manifest.key;
const manifestJson = JSON.stringify(manifest, null, 2);

// 3. Stage files into a temp directory
const stage = path.join(ROOT, '_zip_stage');
if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true });
fs.mkdirSync(stage);

// Write stripped manifest
fs.writeFileSync(path.join(stage, 'manifest.json'), manifestJson);

// Copy popup.html, dist/, icons/
fs.copyFileSync(path.join(ROOT, 'popup.html'), path.join(stage, 'popup.html'));
copyDir(path.join(ROOT, 'dist'), path.join(stage, 'dist'));
copyDir(path.join(ROOT, 'icons'), path.join(stage, 'icons'));

// 4. Zip the stage directory
console.log(`Zipping → ${path.basename(outFile)}`);
if (fs.existsSync(outFile)) fs.rmSync(outFile);

const isWindows = process.platform === 'win32';
if (isWindows) {
  execSync(
    `powershell -Command "Compress-Archive -Force -Path '${stage}\\*' -DestinationPath '${outFile}'"`,
    { stdio: 'inherit' }
  );
} else {
  execSync(`cd "${stage}" && zip -r "${outFile}" .`, { stdio: 'inherit' });
}

// 5. Cleanup
fs.rmSync(stage, { recursive: true });
console.log(`Done → ${path.basename(outFile)}`);

// ---------------------------------------------------------------------------

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
