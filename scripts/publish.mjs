#!/usr/bin/env node
/**
 * 一键发布到 GitHub。
 *
 * 前提：本机已装 `gh` 并完成授权（`gh auth login`）。
 *
 * 做的事情：
 *   1. 确认工作区干净、版本号已同步（package.json / manifest.json / versions.json）
 *   2. 建公开仓库（已存在则跳过），把 main 分支推上去
 *   3. 打一个与 manifest.json 版本一致的 tag 并推送
 *      → GitHub Actions（.github/workflows/release.yml）会自动构建、跑测试，
 *        并把 main.js / manifest.json / styles.css 挂到 Release 上
 *
 * 用法：
 *   node scripts/publish.mjs                 # 用默认仓库名
 *   REPO=owner/name node scripts/publish.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_REPO_NAME = "obsidian-latest-arrivals";
const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: opts.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    ...opts,
  });
}

function capture(cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function main() {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const versions = JSON.parse(readFileSync(path.join(ROOT, "versions.json"), "utf8"));
  const version = manifest.version;

  // ---- 版本一致性 ----
  const problems = [];
  if (pkg.version !== version) problems.push(`package.json 是 ${pkg.version}`);
  if (versions[version] !== manifest.minAppVersion) {
    problems.push(`versions.json 缺少 ${version} → ${manifest.minAppVersion}`);
  }
  if (problems.length) {
    console.error(`✗ 版本号不同步（manifest.json = ${version}）：`);
    for (const p of problems) console.error(`   - ${p}`);
    process.exit(1);
  }

  // ---- 工作区干净 ----
  const dirty = capture("git", ["status", "--porcelain"]);
  if (dirty) {
    console.error("✗ 工作区有未提交的改动，请先提交：\n" + dirty);
    process.exit(1);
  }

  // ---- 授权 ----
  try {
    const login = capture("gh", ["api", "user", "--jq", ".login"]);
    const owner = process.env.REPO ? process.env.REPO.split("/")[0] : login;
    const repo = process.env.REPO || `${owner}/${DEFAULT_REPO_NAME}`;
    console.log(`✓ 已授权为 ${login}，目标仓库 ${repo}`);

    // ---- 建仓库 / 配 remote ----
    let remote = "";
    try {
      remote = capture("git", ["remote", "get-url", "origin"]);
    } catch {
      /* 还没有 remote */
    }
    if (!remote) {
      const exists = (() => {
        try {
          capture("gh", ["repo", "view", repo, "--json", "name"]);
          return true;
        } catch {
          return false;
        }
      })();
      if (exists) {
        console.log(`· 仓库已存在，直接绑定 remote`);
        run("git", ["remote", "add", "origin", `https://github.com/${repo}.git`]);
      } else {
        run("gh", [
          "repo",
          "create",
          repo,
          "--public",
          "--source=.",
          "--remote=origin",
          "--push",
          "--description",
          manifest.description,
        ]);
      }
    } else {
      console.log(`· 已有 remote：${remote}`);
    }

    run("git", ["push", "-u", "origin", "main"]);

    // ---- 打 tag 触发 Actions 发版 ----
    const tag = version;
    const hasTag = (() => {
      try {
        capture("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]);
        return true;
      } catch {
        return false;
      }
    })();
    if (!hasTag) {
      run("git", ["tag", tag]);
    }
    run("git", ["push", "origin", tag]);

    console.log("");
    console.log(`✓ 已推送 tag ${tag}，GitHub Actions 正在构建并发版。`);
    console.log(`  进度：https://github.com/${repo}/actions`);
    console.log(`  发版后：https://github.com/${repo}/releases`);
    console.log("");
    console.log("手机端首次安装：BRAT → Add a beta plugin → 填 " + repo);
    console.log("之后更新：BRAT → Check for updates to all beta plugins");
  } catch (err) {
    console.error("✗ 发布失败：", err.message);
    process.exit(1);
  }
}

void ARTIFACTS;
main();
