#!/usr/bin/env node
/**
 * 发一个新版本。
 *
 * 做的事：升版本号 → 同步 package.json / manifest.json / versions.json →
 * 提交 → 打 tag → 推送 → GitHub Actions 自动构建并发 Release。
 *
 * 用法（必须在项目目录里执行）：
 *   npm run release                 # 补丁版本 1.1.1 → 1.1.2
 *   npm run release -- minor        # 次版本   1.1.1 → 1.2.0
 *   npm run release -- major        # 主版本   1.1.1 → 2.0.0
 *   npm run release -- 1.5.0        # 指定版本号
 *   npm run release -- --dry-run    # 只演示会做什么，不改任何东西
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bump = args.find((a) => !a.startsWith("--")) || "patch";

const VALID_BUMPS = ["patch", "minor", "major"];
const isExplicitVersion = /^\d+\.\d+\.\d+$/.test(bump);

function run(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8", stdio: "inherit" });
}

function capture(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8" }).trim();
}

function readVersion() {
  return JSON.parse(readFileSync(path.join(ROOT, "manifest.json"), "utf8")).version;
}

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function main() {
  // ---- 必须站在项目目录里 ----
  if (!readFileSafe(path.join(ROOT, "package.json"))) {
    fail(`这里不是插件项目目录：${ROOT}`);
  }

  if (!isExplicitVersion && !VALID_BUMPS.includes(bump)) {
    fail(`参数 "${bump}" 不认识。可用：patch / minor / major / 1.2.3`);
  }

  // ---- 工作区必须干净，否则版本提交会把无关改动一起带上 ----
  const dirty = capture("git", ["status", "--porcelain"]);

  const before = readVersion();
  const next = isExplicitVersion ? bump : nextVersion(before, bump);

  // ---- 预演：只报会做什么，不改任何东西 ----
  if (dryRun) {
    console.log(`\n[预演] 当前版本 ${before} → 目标版本 ${next}`);
    console.log(`[预演] 会依次执行：`);
    console.log(`  1. npm version ${bump} --no-git-tag-version`);
    console.log(`  2. node scripts/sync-version.mjs        # 同步 manifest.json / versions.json`);
    console.log(`  3. git add -A && git commit -m "release: v${next}"`);
    console.log(`  4. node scripts/publish.mjs             # 推 main、打 tag ${next}、推 tag`);
    console.log(`  5. GitHub Actions 自动构建 + 跑测试 + 发 Release ${next}\n`);
    if (dirty) {
      console.log(`⚠️  当前工作区有未提交的改动，正式发版前需要先提交或撤销：`);
      console.log(dirty.split("\n").map((l) => "     " + l).join("\n"));
      console.log("");
    } else {
      console.log(`✓ 工作区干净，随时可以执行 npm run release\n`);
    }
    return;
  }

  if (dirty) {
    console.error("工作区有未提交的改动：\n" + dirty);
    fail("请先 git commit，或先撤销这些改动，再发版");
  }

  console.log(`\n▸ ${before} → ${next}`);

  // ---- 1. 升版本号（不建 git tag，tag 交给 publish 统一处理）----
  run("npm", ["version", bump, "--no-git-tag-version"]);

  // ---- 2. 同步到 manifest.json / versions.json ----
  run("node", ["scripts/sync-version.mjs"]);

  const after = readVersion();

  // ---- 3. 提交 ----
  run("git", ["add", "-A"]);
  run("git", ["commit", "-m", `release: v${after}`]);

  console.log(`\n▸ 已提交 v${after}，开始推送...\n`);

  // ---- 4. 建仓库 / 推 main / 打 tag / 推 tag ----
  run("node", ["scripts/publish.mjs"]);
}

function bumpLabel(b) {
  return { patch: "补丁", minor: "次", major: "主" }[b] || "";
}

/** 按 semver 规则算出下一个版本号，仅用于预演展示 */
function nextVersion(current, kind) {
  const [major, minor, patch] = current.split(".").map((n) => parseInt(n, 10) || 0);
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "major") return `${major + 1}.0.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function readFileSafe(p) {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}

main();
