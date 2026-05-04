#!/usr/bin/env node
// `ogdb` shim — locates the platform binary staged by scripts/install.js
// and execs it with the user's argv. Falls back to a helpful error if the
// binary is missing.

"use strict";

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const isWin = process.platform === "win32";
const binName = isWin ? "ogdb.exe" : "ogdb";
const candidates = [
  path.join(__dirname, binName),
  // dev fallback for monorepo: resolve to cargo target
  path.join(__dirname, "..", "..", "..", "target", "release", binName),
  path.join(__dirname, "..", "..", "..", "target", "debug", binName),
];

const binary = candidates.find((p) => {
  try { return fs.existsSync(p); } catch { return false; }
});

if (!binary) {
  console.error("[opengraphdb] native ogdb binary is not installed.");
  console.error("  Try:");
  console.error("    npm rebuild @opengraphdb/cli");
  console.error("  Or install directly:");
  console.error("    curl -fsSL https://opengraphdb.com/install.sh | sh");
  process.exit(1);
}

const child = spawn(binary, process.argv.slice(2), {
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

child.on("error", (err) => {
  console.error(`[opengraphdb] failed to spawn ogdb: ${err.message}`);
  process.exit(1);
});
