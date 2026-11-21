#!/usr/bin/env node
/**
 * Deterministic release artifact packager for ATOMS.
 *
 * Verifies Git branch/tag state, confirms a fresh production build (`dist/index.html`),
 * exports an immutable source archive via `git archive`, packages the compiled web bundle,
 * and emits SHA-256 checksums + a release manifest into `releases/v<version>/`.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = String(pkg.version);
const tagName = `v${version}`;
const releaseDir = path.join("releases", tagName);

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const headSha = git(["rev-parse", "HEAD"]);
const statusPorcelain = git(["status", "--porcelain"]);
const tagExists = (() => {
  try {
    return git(["rev-parse", "--verify", tagName]);
  } catch {
    return null;
  }
})();
const v05Sha = (() => {
  try {
    return git(["rev-parse", "--verify", "v0.5.0^{commit}"]);
  } catch {
    return null;
  }
})();

if (statusPorcelain.length > 0 && !process.argv.includes("--allow-dirty")) {
  console.error("Refusing to package release with uncommitted changes:\n" + statusPorcelain);
  process.exit(1);
}

if (!existsSync("dist/index.html")) {
  console.error("Missing dist/index.html. Run `npm run build` before `npm run release:pack`.");
  process.exit(1);
}

mkdirSync(releaseDir, { recursive: true });

const prefix = `atoms-${tagName}`;
const sourceArchive = path.join(releaseDir, `${prefix}-source.tar.gz`);
const distArchive = path.join(releaseDir, `${prefix}-web-dist.tar.gz`);
const standaloneHtml = path.join(releaseDir, `${prefix}-index.html`);
const manifestPath = path.join(releaseDir, `${prefix}-manifest.json`);
const checksumsPath = path.join(releaseDir, "SHA256SUMS.txt");

// Package immutable Git snapshot from HEAD (or tag when matching HEAD)
const archiveRef = tagExists && git(["rev-parse", `${tagName}^{commit}`]) === headSha ? tagName : "HEAD";
execFileSync("git", ["archive", "--format=tar.gz", `--prefix=${prefix}/`, "-o", sourceArchive, archiveRef]);

// Package verified production dist/ build
execFileSync("tar", ["-czf", distArchive, "-C", "dist", "."]);
copyFileSync("dist/index.html", standaloneHtml);

const artifactFiles = [sourceArchive, distArchive, standaloneHtml];
const artifacts = artifactFiles.map((filePath) => ({
  file: path.basename(filePath),
  bytes: statSync(filePath).size,
  sha256: sha256File(filePath),
}));

const manifest = {
  project: "ATOMS — General Atomic Quantum Laboratory",
  packageName: pkg.name,
  version,
  tag: tagName,
  tagMatchesHead: Boolean(tagExists && git(["rev-parse", `${tagName}^{commit}`]) === headSha),
  branch,
  commitSha: headSha,
  immutableV05Baseline: {
    tag: "v0.5.0",
    branch: "release/v0.5.0",
    commitSha: v05Sha,
  },
  generatedAt: new Date().toISOString(),
  artifacts,
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const checksumLines = [
  ...artifacts.map((a) => `${a.sha256}  ${a.file}`),
  `${sha256File(manifestPath)}  ${path.basename(manifestPath)}`,
];
writeFileSync(checksumsPath, checksumLines.join("\n") + "\n");

console.log(`Packaged ${tagName} release artifacts in ${releaseDir}/`);
console.log(`  branch: ${branch} (${headSha})`);
console.log(`  immutable v0.5.0: ${v05Sha ?? "untagged"}`);
for (const a of artifacts) {
  console.log(`  ${a.file}: ${(a.bytes / 1024).toFixed(1)} KiB  sha256=${a.sha256}`);
}
