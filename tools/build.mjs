#!/usr/bin/env node
// Assemble the publishable site into dist/.
//
//   node tools/build.mjs
//
// The game is one file you can open directly, so this is the *publish* step,
// not a dev step. It copies only the public allowlist into dist/, which means
// everything else in the repo (AGENTS.md, docs/, tools/, .claude/) is never
// uploaded to the web host. The Pages workflow runs this and deploys dist/.
import { rmSync, mkdirSync, copyFileSync, existsSync, statSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");

// Everything the live site needs, and nothing else. Optional entries are copied
// only when present; a missing `required` file aborts the build.
const PUBLIC = [
  { file: "index.html", required: true },
  { file: "og.png", required: true },
  { file: "manifest.webmanifest", required: false },
  { file: "sw.js", required: false },
  { file: "icon-192.png", required: false },
  { file: "icon-512.png", required: false },
  { file: "apple-touch-icon.png", required: false },
  { file: ".nojekyll", required: false },
  { file: "robots.txt", required: false },
  { file: "CNAME", required: false },   // custom domain, copied through if you add one
  { file: "LICENSE", required: false },
];

function fail(msg) { console.error("build: " + msg); process.exit(1); }

// Fresh dist/ each run, so a file removed from the allowlist can't linger.
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const copied = [];
for (const entry of PUBLIC) {
  const src = path.join(ROOT, entry.file);
  if (!existsSync(src)) {
    if (entry.required) fail(`missing required file: ${entry.file}`);
    continue;
  }
  copyFileSync(src, path.join(DIST, entry.file));
  copied.push({ name: entry.file, bytes: statSync(src).size });
}

// Cheap sanity gates, no dependencies: the page has a title and og.png is real.
const html = readFileSync(path.join(DIST, "index.html"), "utf8");
if (!/<title>[^<]+<\/title>/.test(html)) fail("index.html has no <title>");
if (statSync(path.join(DIST, "og.png")).size < 10000) fail("og.png looks empty");

const total = copied.reduce((n, f) => n + f.bytes, 0);
for (const f of copied) console.log(`  ${f.name.padEnd(12)} ${(f.bytes / 1024).toFixed(1)} KB`);
console.log(`dist/ ready: ${copied.length} files, ${(total / 1024).toFixed(1)} KB total`);
