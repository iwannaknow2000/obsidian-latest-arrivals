# 最新入库 · Latest Arrivals

[![Release](https://img.shields.io/github/v/release/iwannaknow2000/obsidian-latest-arrivals?label=release)](https://github.com/iwannaknow2000/obsidian-latest-arrivals/releases/latest)
[![Test](https://github.com/iwannaknow2000/obsidian-latest-arrivals/actions/workflows/release.yml/badge.svg)](https://github.com/iwannaknow2000/obsidian-latest-arrivals/actions/workflows/release.yml)

一个为 **Android 手机端（已在 iQOO 13 上使用）** 设计的轻量 Obsidian 插件：
**找出通过 Syncthing 等第三方工具最新同步到本机的笔记，一点即可打开。**

针对参考插件 [Recently Added Files](https://community.obsidian.md/plugins/recently-added-files) 抓不到第三方同步文件的根因做了修复。

| | |
|---|---|
| 插件 id | `latest-arrivals` |
| 打包体积 | `main.js` **37 KB**（gzip 后 12 KB），**零运行时依赖** |
| 平台 | Android / iOS / 桌面端（`isDesktopOnly: false`） |
| 最低 Obsidian | 1.5.0（≥ 1.8.7 时自动使用官方 `localStorage` API） |

---

## 1. 为什么 Recently Added Files 抓不到 Syncthing 的笔记

读了那款插件的源码（`src/modules/recent-files/index.ts`），它的实现是：

```ts
this.plugin.app.workspace.onLayoutReady(() => {
    this.isInitialized = true;
    this.registerFileEvents();   // 只监听 vault.on('create' | 'modify' | 'rename' | 'delete')
});
```

- 它**只依赖 Obsidian 的 `create` 事件**，并且把事件注册放在「布局就绪之后」，
  等于主动丢弃了启动时那一轮全库扫描的结果。
- 而 Syncthing 绝大多数时候是在 **Obsidian 关闭状态下**把文件写进 vault 的；
  这些文件是在下次启动的**初始索引扫描**里被发现的，**根本不产生 `create` 事件**。
- 结果：第三方同步进来的笔记永远不会出现在它的列表里。

**结论：只要不依赖 Obsidian 的事件时机，问题就消失了。**

---

## 2. 工作原理：设备本地「到货台账」

插件自己维护一张 **路径 → 首次被发现时间** 的表，每次刷新都做一次**全库集合差**，
而不是等事件。关键在于这张表存在哪里：

| 存储位置 | 会被 Syncthing 同步吗 | 结论 |
|---|---|---|
| `data.json`（插件目录） | ✅ 会 | ❌ Mac 与手机互相覆盖，还会产生 `sync-conflict` 副本 |
| 知识库内任意文件 | ✅ 会 | ❌ 同上 |
| **`App.saveLocalStorage()`** | ❌ **设备本地、按 vault 隔离** | ✅ **采用** |

`saveLocalStorage` / `loadLocalStorage` 是 Obsidian 官方 API，注释写着
*“Save vault-specific value to localStorage”*——数据存在 App 本地存储里，
**不进 vault、不被同步**，正好符合「按设备记录到货时间」的语义。

### 刷新流程

```
插件加载 / App 回到前台 / 文件事件（防抖 2s）/ 手动刷新
        │
        ▼
  ① 快路径：app.vault.getMarkdownFiles() + 内存里的 TFile.stat   ← 零 IO，毫秒级
  ② 深路径：adapter.list 递归遍历，抓 Obsidian 索引还没收录的 .md  ← 按间隔节流
        │
        ▼
  与台账对账（纯同步、无 IO）
   ├── 已知路径 → 保留冻结的 firstSeen
   ├── 路径消失 + 出现同 (size,mtime) 的新路径 → 判定为重命名，继承原时间
   └── 真正的新路径 → 判定为新到货，写入 firstSeen
```

### 三个时间口径

| 口径 | 来源 | 说明 |
|---|---|---|
| **入库时间**（默认） | 台账 `firstSeen` | 这篇笔记**到达本机**的时间。不依赖文件属性，Syncthing 场景下唯一可靠 |
| 创建时间 | `TFile.stat.ctime` | Android/Linux 上是 inode change time，需真机验证（见下） |
| 修改时间 | `TFile.stat.mtime` | Syncthing **会保留源文件 mtime**，所以这实际是「你在电脑上写作的时间」 |
| 笔记大小 | `TFile.stat.size` | 字节数 |

### 为什么需要「到货窗口」兜底

Syncthing 上游有一个专门的提交
[`lib/fs: Ignore inode change time on Android`](https://github.com/syncthing/syncthing/commit/16ae1fbe5e77b682aff1c546fe20bf3904cd42df)，
说明 **Android 上 `ctime` 的语义确实有坑**。因此新发现文件的入库时间算法是：

- **首次启用（建基线）**：用 `max(ctime, mtime)` 回填，避免 762 篇笔记并列同一时刻；
- **之后每轮**：若时间属性落在「上次扫描 → 现在」这个窗口内，就采用它
  （这样同一批同步进来的多个文件能排出先后）；若明显偏旧，说明时间属性不可信，
  直接记为本轮到货 —— **保证刚同步来的笔记一定排在列表最前面**。

---

## 3. 功能

### 排序（5 个键 × 升/降序）

`文件名（拼音首字母）` · `入库时间` · `创建时间` · `修改时间` · `笔记大小`

拼音排序是**零依赖**实现的：利用 JS 运行时 ICU 内置的中文排序，
配合一张「声母边界表」做二分查找定位声母，再叠加一张 <1 KB 的多音字覆盖表。
实测：

```
知识管理→ZSGL  本地部署→BDBS  微信→WX  数学→SX  法律→FL  经济→JJ
物理→WL  化学→HX  中国→ZG  北京→BJ  上海→SH  长沙→CS  厦门→XM
```

启动时会自检 `Intl.Collator('zh')` 是否真的具备拼音数据；若设备 WebView 不支持，
自动降级为编码顺序并在设置页给出提示（不会静默给出错误顺序）。

### 入口（都进了 Obsidian 的功能菜单）

| 入口 | 说明 |
|---|---|
| **侧边栏标签页**（推荐） | 打开一次后常驻，侧边栏顶部点图标即切换；开关在 设置 →「侧边栏标签页」 |
| **功能区图标** | 时钟形状，桌面端在左侧功能区；移动端在右下角 ☰ 菜单里（**默认隐藏，需手动添加一次**，见下） |
| 命令「打开最新入库列表」 | 弹出最近 N 篇，**点击即打开**，长按出菜单 |
| 命令「在侧边栏打开完整列表（含排序）」 | 完整列表 + 排序控件 + 拼音分组 + 关键字过滤 |
| 命令「在侧边栏显示/隐藏「最新入库」标签页」 | 切换常驻标签页 |
| 命令「在新标签页打开最新入库的若干篇」 | 批量打开 |
| 命令「立即重新扫描」/「重建到货台账」 | 手动维护 |
| 文件右键 / 长按菜单 | 「打开『最新入库』列表」「从『最新入库』中忽略」 |

「最新入库」条数可在设置里调 **1–10**。

### 📱 手机上怎么把它放进右下角的 ☰ 菜单

Obsidian 移动端的**功能区（Ribbon）**在右下角 ☰ 里，但**插件加的图标默认是隐藏的**——
这是 Obsidian 的设计，插件无法代劳。需要手动加一次：

1. 设置 → **外观** → 向下滚到「**高级**」
2. 在「**功能区设置**」一行点「**管理**」
3. 找到「**最新入库**」，点它左侧的绿色 **➕**
4. 之后点右下角 ☰ 就能直接看到它

> **更省事的做法**：用**侧边栏标签页**。插件启动时会自动把它挂到侧边栏，
> 打开一次后 Obsidian 会记住（记在 `workspace-mobile.json` 里，该文件不被 Syncthing 同步，
> 所以手机和 Mac 的布局互不干扰），之后在侧边栏顶部点图标即可切换。
> 如果想更快，还可以把 ☰ 的「**快速访问**」短按行为直接设成打开「最新入库」。

### 设置页诊断面板

真机上「ctime 到底准不准」「拼音排序能不能用」不用猜 —— 设置页直接列出：
拼音自检结果、台账条目数、上次扫描摘要、以及最近 10 篇的三项原始时间戳 + 大小 + 路径。

---

## 4. 安装

### 方式 A：BRAT（推荐，能一键更新）

1. 在 Obsidian 里装社区插件 **BRAT**（`obsidian42-brat`）。
2. 命令面板运行 **BRAT: Add a beta plugin for testing**。
3. 填仓库地址：`iwannaknow2000/obsidian-latest-arrivals`
4. 回到 **设置 → 第三方插件**，启用「最新入库」。
5. 以后更新：命令面板运行 **BRAT: Check for updates to all beta plugins**。

> 发版只需 `npm version patch && git push --follow-tags`，
> GitHub Actions 会自动构建、跑测试，并把 `main.js` / `manifest.json` / `styles.css`
> 挂到 Release 上，手机上点一下 BRAT 就更新好了。

### 方式 B：手动复制（无需 BRAT，适合网络受限时）

> macOS 端的 `.obsidian/plugins/` **不会**同步到手机，所以要手动复制一次。

1. 等 Syncthing 把 `笔记同步助手/latest-arrivals/` 同步到手机。
2. 用手机文件管理器把**整个 `latest-arrivals/` 文件夹**复制到：
   `<你的vault路径>/.obsidian/plugins/latest-arrivals/`
   目录内应有 `main.js` / `manifest.json` / `styles.css` 三个文件。
3. 重启 Obsidian → **设置 → 第三方插件** → 启用「最新入库 (Latest Arrivals)」。
4. **升级时**：重复第 2 步覆盖即可（`data.json` 不在分发包里，设置不会丢）。

详细说明见分发包里的 `安装说明.md`。

---

## 5. 开发

```bash
npm install          # 首次
npm run dev          # 监听构建（输出 main.js，带 sourcemap）
npm test             # 全量测试：37 项逻辑断言 + 23 项运行期冒烟断言
npm run build        # 类型检查 + 生产构建
node scripts/deploy.mjs --install   # 生成手机分发包 + 装进本机 vault
```

### 目录结构

```
src/
├── main.ts        插件入口：命令、功能区图标、侧边栏标签页、设置、前台重扫
├── ledger.ts      到货台账（设备本地持久化、对账、重命名继承、清理）
├── scanner.ts     快路径（vault 索引）+ 深路径（adapter 递归遍历）
├── service.ts     数据核心：扫描 → 对账 → 排序 → 供 UI 消费
├── sort.ts        5 种排序键 + 路径排除 glob
├── pinyin.ts      声母边界二分 + 多音字覆盖 + 能力自检
├── format.ts      字节 / 时间格式化
├── settings.ts    设置页 + 诊断面板
├── types.ts       共享类型与默认设置
└── ui/
    ├── modal.ts   快速弹层（命令面板入口）
    ├── view.ts    侧边栏完整列表（常驻标签页）
    └── row.ts     行渲染（触控目标 ≥52px、长按菜单）
test/
├── run.ts         纯逻辑自测（esbuild 打包后由 node 执行）
├── smoke.cjs      运行期冒烟测试（打桩 obsidian，加载真实构建产物）
└── stub/          打桩的 obsidian API
```

### 测试覆盖

**逻辑自测（`test/run.ts`，37 项）**：拼音首字母与多音字、5 种排序键的升降序、
台账首轮基线、重复扫描不重复计数、firstSeen 冻结、增量发现、重命名继承、
删除后恢复、到货窗口钳制、台账持久化往返、`estimateArrival` 边界。

**运行期冒烟（`test/smoke.cjs`，23 项）**：用打桩的 `obsidian` 模块真实加载
构建产物并跑完 `onload()`，验证命令/视图/功能区图标注册、侧边栏标签页自动挂载
（含位置与「不抢焦点」）、五键排序、台账落在设备本地存储、增量发现与忽略。

---

## 6. 已知限制

- **多音字**：只覆盖了「两个读音声母不同」的常见字（约 40 个），
  像「重庆」这类词仍会按默认读音排。完整词典需要几百 KB，与「轻量」冲突。
- **深扫描**：`adapter.list` 每个目录一次 bridge 调用，大 vault 上约 1–2 秒。
  默认节流到 180 秒一次，可在设置里调整或关闭。
- **尚未被 Obsidian 索引的文件**：深扫能发现并记录其入库时间，但点击打开时
  Obsidian 还不认识它，会提示重启。重启后它会自动出现在正常位置。
- **`data.json` 会被同步**：设置项（条数、排序偏好、忽略列表）会在设备间同步，
  但**到货台账不会**（在 localStorage 里），所以两台设备各记各的到货时间。
