#!/usr/bin/env node
/**
 * 把 package.json 的版本号同步到 manifest.json 和 versions.json。
 *
 * Obsidian 插件的三个版本号必须一致，否则 CI 的 tag 校验会失败：
 *   - package.json     version
 *   - manifest.json    version
 *   - versions.json    { "<version>": "<minAppVersion>" }
 *
 * 用法：
 *   node scripts/sync-version.mjs            # 用 package.json 的版本
 *   node scripts/sync-version.mjs 1.2.0      # 显式指定
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const pkgPath = path.join(ROOT, "package.json");
const manifestPath = path.join(ROOT, "manifest.json");
const versionsPath = path.join(ROOT, "versions.json");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const versions = JSON.parse(readFileSync(versionsPath, "utf8"));

const version = process.argv[2] || pkg.version;

pkg.version = version;
manifest.version = version;
versions[version] = manifest.minAppVersion;

// 版本号从小到大排，方便阅读
const sorted = {};
for (const k of Object.keys(versions).sort((a, b) =>
  a.localeCompare(b, undefined, { numeric: true }),
)) {
  sorted[k] = versions[k];
}

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
writeFileSync(versionsPath, JSON.stringify(sorted, null, 2) + "\n", "utf8");

console.log(`✓ 版本号已统一为 ${version}（minAppVersion ${manifest.minAppVersion}）`);
