#!/usr/bin/env node
// @opengraphdb/cli postinstall — download the matching ogdb binary from
// GitHub Releases and stage it under bin/ so the `ogdb` shim can exec it.
//
// Honors env: OGDB_VERSION (default = package.json version), OGDB_REPO,
// OGDB_SKIP_DOWNLOAD (skip in CI/dev).

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const os = require("os");
const { execSync } = require("child_process");

const PKG = require(path.join(__dirname, "..", "package.json"));
const REPO = process.env.OGDB_REPO || "asheshgoplani/opengraphdb";
const VERSION = process.env.OGDB_VERSION || `v${PKG.version}`;
const BIN_DIR = path.join(__dirname, "..", "bin");
const TARGET = process.env.OGDB_TARGET || detectTarget();

function detectTarget() {
  const platform = process.platform; // 'linux' | 'darwin' | 'win32'
  const arch = process.arch; // 'x64' | 'arm64'
  let osId, archId, ext;
  switch (platform) {
    case "linux":   osId = "linux"; ext = "tar.gz"; break;
    case "darwin":  osId = "macos"; ext = "tar.gz"; break;
    case "win32":   osId = "windows"; ext = "zip"; break;
    default: throw new Error(`unsupported platform: ${platform}`);
  }
  switch (arch) {
    case "x64":     archId = "x86_64"; break;
    case "arm64":   archId = "arm64"; break;
    default: throw new Error(`unsupported arch: ${arch}`);
  }
  return { os: osId, arch: archId, ext, isWin: platform === "win32" };
}

function downloadFollowingRedirects(url, dest, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error("too many redirects"));
    const req = https.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        return downloadFollowingRedirects(res.headers.location, dest, hops + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`download failed (${res.statusCode}): ${url}`));
      }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on("finish", () => out.close(resolve));
      out.on("error", reject);
    });
    req.on("error", reject);
  });
}

async function main() {
  if (process.env.OGDB_SKIP_DOWNLOAD) {
    console.log("[opengraphdb] OGDB_SKIP_DOWNLOAD set, skipping binary download.");
    return;
  }

  const binName = TARGET.isWin ? "ogdb.exe" : "ogdb";
  const finalPath = path.join(BIN_DIR, binName);

  if (fs.existsSync(finalPath)) {
    console.log(`[opengraphdb] ${binName} already present, skipping download.`);
    return;
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });

  const assetName = `ogdb-${TARGET.os}-${TARGET.arch}.${TARGET.ext}`;
  const url = VERSION === "latest"
    ? `https://github.com/${REPO}/releases/latest/download/${assetName}`
    : `https://github.com/${REPO}/releases/download/${VERSION}/${assetName}`;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ogdb-"));
  const archivePath = path.join(tmp, assetName);
  console.log(`[opengraphdb] downloading ${url}`);
  try {
    await downloadFollowingRedirects(url, archivePath);
  } catch (e) {
    console.warn(`[opengraphdb] download failed: ${e.message}`);
    console.warn(`[opengraphdb] you can install manually from https://github.com/${REPO}/releases`);
    // Don't fail npm install — the user can re-run later or install via curl.
    return;
  }

  try {
    if (TARGET.ext === "tar.gz") {
      execSync(`tar -xzf "${archivePath}" -C "${tmp}"`, { stdio: "inherit" });
    } else {
      execSync(`unzip -q "${archivePath}" -d "${tmp}"`, { stdio: "inherit" });
    }
    const found = walk(tmp).find((p) => path.basename(p) === binName);
    if (!found) {
      throw new Error(`could not find ${binName} inside ${assetName}`);
    }
    fs.copyFileSync(found, finalPath);
    if (!TARGET.isWin) {
      fs.chmodSync(finalPath, 0o755);
    }
    console.log(`[opengraphdb] installed ${finalPath}`);
  } catch (e) {
    console.warn(`[opengraphdb] extract failed: ${e.message}`);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

function walk(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else out.push(p);
    }
  }
  return out;
}

main().catch((e) => {
  console.warn(`[opengraphdb] postinstall warning: ${e.message}`);
});
