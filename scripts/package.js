#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile, readdir, stat, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function exec(cmd, args, options) {
  const isWin = process.platform === 'win32';
  const resolvedCmd = isWin && cmd === 'npm' ? 'npm.cmd' : cmd;
  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCmd, args, {
      stdio: 'inherit',
      shell: isWin,
      ...options
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}`));
    });
  });
}

async function loadEnv() {
  const envPath = join(root, '.env');
  try {
    const text = await readFile(envPath, 'utf-8');
    const env = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._ -]/g, '').trim() || 'extension';
}

async function directorySize(dir) {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(path);
    } else {
      const s = await stat(path);
      total += s.size;
    }
  }
  return total;
}

async function generateIcons(iconPath, distIconsDir) {
  await mkdir(distIconsDir, { recursive: true });
  const input = sharp(iconPath);
  const sizes = [16, 48, 128];
  for (const size of sizes) {
    await input
      .resize(size, size, { fit: 'cover' })
      .png()
      .toFile(join(distIconsDir, `icon${size}.png`));
  }
}

const DEFAULT_ICON = join(root, 'public/icons/logo.jpg');

async function main() {
  const env = await loadEnv();
  const title = env.EXTENSION_TITLE || process.env.EXTENSION_TITLE || 'WASession Capture';
  process.env.EXTENSION_TITLE = title;

  const appHosts = env.APP_HOSTS || process.env.APP_HOSTS;
  if (appHosts) process.env.APP_HOSTS = appHosts;

  const iconPath = env.EXTENSION_ICON || process.env.EXTENSION_ICON || DEFAULT_ICON;

  console.log(`\nBuilding "${title}"…\n`);
  await exec('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });

  const dist = join(root, 'dist');
  const distIconsDir = join(dist, 'icons');

  const resolvedIcon = iconPath.startsWith('/')
    ? iconPath
    : join(root, iconPath);
  console.log(`\nGenerating icons from ${resolvedIcon}…`);
  try {
    await generateIcons(resolvedIcon, distIconsDir);
    console.log('   Icons generated successfully');
  } catch (err) {
    throw new Error(`Failed to generate icons: ${err.message}`);
  }

  const zip = new AdmZip();
  zip.addLocalFolder(dist);

  const fileName = `${sanitizeFileName(title)}.zip`;
  const outPath = join(dist, fileName);
  await zip.writeZipPromise(outPath);

  const bytes = (await stat(outPath)).size;
  const kb = (bytes / 1024).toFixed(1);
  const unpacked = await directorySize(dist);
  const unpackedKb = (unpacked / 1024).toFixed(1);

  console.log('\n✅ Extension packaged successfully');
  console.log(`   Output: ${outPath}`);
  console.log(`   Package size: ${kb} KB`);
  console.log(`   Unpacked size: ${unpackedKb} KB`);
}

main().catch((err) => {
  console.error('\n❌ Packaging failed:', err.message);
  process.exit(1);
});
