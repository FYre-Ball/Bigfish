'use strict';
/**
 * afterPack hook: embed the Bigfish icon + version metadata into the Windows
 * executable ourselves, because electron-builder's built-in rcedit step needs
 * the winCodeSign archive whose macOS dylib symlinks fail to extract on a
 * Windows box without Developer Mode. The standalone rcedit binary is bundled
 * in build/ and does the same job without touching those macOS files.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

// 版本号唯一来源:package.json。Windows 版本串是 4 段(a.b.c.d),
// 由 package.json 的 x.y.z 补一个 0 得到,改版本只动 package.json。
const pkg = require('./package.json');
const winVersion = `${pkg.version}.0`;

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }
  const rcedit = path.join(__dirname, 'build', 'rcedit-x64.exe');
  const icon = path.join(__dirname, 'build', 'icon.ico');
  if (!fs.existsSync(rcedit) || !fs.existsSync(icon)) {
    console.log('[afterPack] rcedit or icon missing, skipping exe edit');
    return;
  }
  const exe = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.exe');
  execFileSync(
    rcedit,
    [
      exe,
      '--set-icon', icon,
      '--set-version-string', 'ProductName', pkg.productName || 'Bigfish',
      '--set-version-string', 'FileDescription', pkg.description || 'Bigfish',
      '--set-version-string', 'CompanyName', pkg.author || 'Bigfish',
      '--set-file-version', winVersion,
      '--set-product-version', winVersion,
    ],
    { stdio: 'inherit' },
  );
  console.log(`[afterPack] applied icon + version ${winVersion} to`, exe);
};
