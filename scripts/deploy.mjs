#!/usr/bin/env node
/**
 * 投递构建产物。
 *
 * 背景：macOS 端的 `.obsidian/plugins/` **不会**同步到手机，
 * 所以不能靠 Syncthing 直投插件本体。改为：
 *
 *   1)（默认）把可分发的一套文件写进 vault 的「笔记同步助手/latest-arrivals/」，
 *      这个目录是会同步到手机的；在手机上把它整体复制到
 *      <vault>/.obsidian/plugins/latest-arrivals/ 即可。
 *   2)（加 --install）同时装进本机 vault 的 `.obsidian/plugins/`，
 *      方便在 Mac 上先验证行为。
 *
 * 用法：
 *   node scripts/deploy.mjs                 # 只生成手机端分发包
 *   node scripts/deploy.mjs --install       # 额外装到本机 vault
 *   VAULT=/path/to/vault node scripts/deploy.mjs
 */
import { copyFile, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";

const PLUGIN_ID = "latest-arrivals";
const DIST_DIR_NAME = "笔记同步助手";
const VAULT = process.env.VAULT || "/Users/yzx224/Obsidian_Vault";
const ROOT = path.resolve(import.meta.dirname, "..");
const INSTALL = process.argv.includes("--install");

const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];

const README = `# 最新入库 (Latest Arrivals) — 手机端安装说明

## 这个文件夹是什么

这是 Obsidian 插件「最新入库」v{version} 的可分发文件。
你的 Mac 端 \`.obsidian/plugins/\` 不会同步到手机，所以插件本体放在这里，
由 Syncthing 同步过来，再由你手动复制进手机 vault 的插件目录。

## 方式一：BRAT（推荐，能一键更新）

1. 在 Obsidian 里装社区插件 **BRAT**（\`obsidian42-brat\`，官方市场可搜到）。
2. 命令面板运行 **BRAT: Add a beta plugin for testing**。
3. 填 \`iwannaknow2000/obsidian-latest-arrivals\`
4. 回到 **设置 → 第三方插件**，启用「最新入库」。
5. 以后更新：命令面板运行 **BRAT: Check for updates to all beta plugins**。

## 方式二：手动复制（约 1 分钟）

已知手机 vault 里已存在 \`.obsidian/plugins/\` 目录。

1. 用手机文件管理器（或 Obsidian 的「文件」能力 + 任意文件管理 App）打开本目录
   \`笔记同步助手/latest-arrivals/\`。
2. **整个文件夹**复制到手机的：

   \`<你的vault路径>/.obsidian/plugins/latest-arrivals/\`

   复制完成后，那个目录里应当有且仅有这三个文件：

   - \`main.js\`
   - \`manifest.json\`
   - \`styles.css\`

3. 回到 Obsidian（推荐先「重启 Obsidian」以确保扫描到新插件），进入
   **设置 → 第三方插件**，在已安装插件列表里启用「最新入库 (Latest Arrivals)」。

> 若列表里看不到它，点一下「已安装插件」右侧的刷新图标，或彻底关闭再打开 Obsidian。

> **升级时**：重复第 1–2 步覆盖旧文件即可。插件的设置存在 \`data.json\` 里，
> 它在插件目录中但不在本分发包内，所以覆盖不会丢设置；
> 到货台账存在 Obsidian 的本地存储里，同样不受影响。

## 怎么用

插件装好后有 **两个可以直接点的位置**：

### 1. 侧边栏标签页（推荐，最省事）

插件启动时会自动把「最新入库」挂到**侧边栏**。打开一次之后 Obsidian 会记住它
（记在 \`workspace-mobile.json\`，这个文件不被同步，手机和 Mac 的布局互不干扰），
以后在**侧边栏顶部点一下那个时钟图标**就能直接切换过去。

想换位置或关掉：**设置 → 最新入库 → 入口 → 侧边栏标签页**。

### 2. 右下角 ☰ 菜单（功能区）

> ⚠️ **插件加的图标在移动端功能区区默认是隐藏的**，必须手动添加一次。
> 这是 Obsidian 的设计，插件无法代劳。

1. **设置 → 外观** → 向下滚到「**高级**」
2. 在「**功能区设置**」一行点「**管理**」
3. 找到「**最新入库**」，点它左侧的绿色 **➕**
4. 之后点右下角 ☰ 就能看到它

进阶：在同一个界面把 ☰ 的「**快速访问**」短按行为直接设成打开「最新入库」，
就变成一键直达。

### 3. 命令面板

搜「最新入库」，有以下命令：

- 打开最新入库列表（弹出最近 N 篇，点一下直接打开，长按出菜单）
- 在侧边栏打开完整列表（含排序）
- 在侧边栏显示/隐藏「最新入库」标签页
- 在新标签页打开最新入库的若干篇
- 立即重新扫描 / 重建到货台账

### 4. 排序

完整列表里可以按 **入库时间 / 文件名拼音首字母 / 创建时间 / 修改时间 / 大小**
升序或降序排列，拼音模式下还能按 A–Z 分组，并支持关键字过滤。
「快速列表显示条数」可在设置里调 1–10。

## 为什么 Recently Added Files 抓不到 Syncthing 的笔记

那个插件只监听 Obsidian 的 \`create\` 事件。而 Syncthing 通常是在 Obsidian
**关闭时**把文件写进 vault 的，这些文件是在下次启动的全库扫描里被发现的，
**不产生任何事件**，于是就被漏掉了。

「最新入库」改为每次刷新做一次**全库集合差**，并用一张存在设备本地
（localStorage，不进 vault、不被同步）的「到货台账」记录每篇笔记**首次出现在
本机**的时间。因此无论 Syncthing 在什么时候写入，都能被抓到。
`;

async function exists(p) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function assertInside(child, parent) {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  if (c !== p && !c.startsWith(p + path.sep)) {
    throw new Error(`目标路径越界，已中止：${c}`);
  }
}

async function copyArtifacts(targetDir) {
  await mkdir(targetDir, { recursive: true });
  for (const f of PLUGIN_FILES) {
    const src = path.join(ROOT, f);
    if (!(await exists(src))) {
      throw new Error(`缺少构建产物 ${f}，请先运行 npm run build`);
    }
    await copyFile(src, path.join(targetDir, f));
  }
}

/** 在 vault 根下写入 / 更新 community-plugins.json 中的插件 id */
async function enableInCommunityList(configDir) {
  const listPath = path.join(configDir, "community-plugins.json");
  let list = [];
  if (await exists(listPath)) {
    try {
      const parsed = JSON.parse(await readFile(listPath, "utf8"));
      if (Array.isArray(parsed)) list = parsed;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await copyFile(listPath, `${listPath}.bak-${stamp}`);
    } catch (err) {
      console.warn(`! 无法解析 community-plugins.json，跳过启用步骤：${err.message}`);
      return false;
    }
  }
  if (list.includes(PLUGIN_ID)) return false;
  list.push(PLUGIN_ID);
  await writeFile(listPath, JSON.stringify(list, null, 2) + "\n", "utf8");
  return true;
}

async function main() {
  const configDir = path.join(VAULT, ".obsidian");
  if (!(await exists(configDir))) {
    console.error(`✗ ${VAULT} 看起来不是一个 Obsidian vault（找不到 .obsidian）`);
    process.exit(1);
  }

  const manifest = JSON.parse(
    await readFile(path.join(ROOT, "manifest.json"), "utf8"),
  );

  // ---- 1) 同步给手机的分发包 ----
  const distTarget = path.join(VAULT, DIST_DIR_NAME, PLUGIN_ID);
  assertInside(distTarget, VAULT);
  await copyArtifacts(distTarget);
  await writeFile(
    path.join(distTarget, "安装说明.md"),
    README.replace("{version}", manifest.version),
    "utf8",
  );
  console.log(`✓ 已生成手机端分发包 → ${distTarget}`);
  console.log(`  （等待 Syncthing 同步后，在手机上把整个 ${PLUGIN_ID}/ 复制进`);
  console.log(`    <vault>/.obsidian/plugins/ 即可）`);

  // ---- 2) 可选：装进本机 vault，便于在 Mac 上验证 ----
  if (INSTALL) {
    const installTarget = path.join(configDir, "plugins", PLUGIN_ID);
    assertInside(installTarget, VAULT);
    await copyArtifacts(installTarget);
    console.log(`✓ 已安装到本机 vault → ${installTarget}`);
    const changed = await enableInCommunityList(configDir);
    console.log(
      changed
        ? `✓ 已把 "${PLUGIN_ID}" 加入本机 community-plugins.json（原文件已备份）`
        : `· "${PLUGIN_ID}" 已在本机 community-plugins.json 中`,
    );
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
