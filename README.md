# 最新入库 · Latest Arrivals

[![Release](https://img.shields.io/github/v/release/iwannaknow2000/obsidian-latest-arrivals?label=release)](https://github.com/iwannaknow2000/obsidian-latest-arrivals/releases/latest)
[![Test](https://github.com/iwannaknow2000/obsidian-latest-arrivals/actions/workflows/release.yml/badge.svg)](https://github.com/iwannaknow2000/obsidian-latest-arrivals/actions/workflows/release.yml)

一个为 **Android 手机端（已在 iQOO 13 上使用）** 设计的轻量 Obsidian 插件：
**找出通过 Syncthing 等第三方工具最新同步到本机的笔记，一点即可打开。**

针对参考插件 [Recently Added Files](https://community.obsidian.md/plugins/recently-added-files) 抓不到第三方同步文件的根因做了修复。

| | |
|---|---|
| 插件 id | `latest-arrivals` |
| 显示名称 | **Latest Arrivals**（英文，默认）；命令与界面文案随语言切换 |
| 界面语言 | 英文 / 简体中文 / 繁體中文，默认跟随 Obsidian |
| 配置备份 | 支持导出/导入 JSON，可跨设备搬运设置 |
| 打包体积 | `main.js` **68 KB**（gzip 后 19 KB），**零运行时依赖** |
| 平台 | Android / iOS / 桌面端（`isDesktopOnly: false`） |
| 最低 Obsidian | 1.8.7 |

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

> #### 与 Recently Added Files 的关系
>
> 本项目**不是它的 fork**。我们只读了它的源码用于**定位问题根因**（上面那段分析），
> 实现完全不同——本项目是「全库集合差 + 设备本地到货台账」，**没有一行代码来自该插件**，
> 仓库也是全新的、不含原始仓库的任何代码或提交历史。
> 在此致谢 [Lemon695/obsidian-recently-added-files](https://github.com/Lemon695/obsidian-recently-added-files)
> 提供了问题定位的起点。

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

## 3. 界面语言

插件**默认英文**，并会跟随你的 Obsidian 界面语言自动切换；也可以在
**设置 → Latest Arrivals → Interface language** 里手动锁定。

| 语言 | 状态 |
|---|---|
| English | 默认，也是所有语言缺失键的回退目标 |
| 简体中文 | ✅ |
| 繁體中文 | ✅ |

命令名称、功能区提示、侧边栏标题都是在插件加载时注册的，Obsidian 没有「改名」 API，
所以切换语言时插件会自动重新加载一次；万一失败会提示你手动关掉再打开。

新增一种语言只需要在 `src/i18n/` 下加一个文件、在 `LOCALES` 里注册一行——
`npm test` 里有断言会检查各语言包的键集合与占位符是否完全对齐。

> `manifest.json` 里的 `name` / `description` 由 Obsidian 直接读取，
> **无法按语言变化**，所以插件列表里始终显示英文名。

---

## 4. 功能

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

### 📱 手机上怎么「调出来」

> **先排除一条死路**：官方帮助文档里说的「设置 → 外观/界面 → 功能区 → 管理」
> **在移动端不存在**。官方文档本身也写着「移动端应用没有功能区」——
> 实测在手机设置里搜 `Ribbon` 无任何结果。插件加了功能区图标，但手机上无处可配。

移动端真正可用的入口是下面三条：

**① 左侧抽屉的视图列表（推荐）**

插件会自动把 `Latest Arrivals` 作为**视图标签页**挂到侧边栏。安卓左侧抽屉底部那份
列表（文件列表 / 搜索 / 标签 / 书签 …）里就会出现它，点一下即切换过去。

没看到的话去 **设置 → Latest Arrivals → 入口 → 侧边栏标签页**，选 **「左侧边栏」**。

> ⚠️ v1.2.0 及更早版本有个 bug：旧版默认值是「右侧」，升级后 `data.json` 里存着它，
> 而切换设置时标签页**不会搬家**（`ensureSidebarTab` 发现已有标签页就提前返回）。
> v1.2.1 已修复（新增 `applySidebarSide()`，会先拆掉位置不对的再重挂）。
> 旧版临时绕过办法：先把设置改成「不挂载」（会拆掉），再改成「左侧边栏」。

**② 快速操作（下拉即达）**

设置 → **界面** → **快速操作** → 设为 `Latest Arrivals: 打开最新入库列表`。
之后**从屏幕顶部下拉**就直接打开列表。

> 注意「快速操作」是**单选**的。设成别的东西之后，功能区/命令面板的入口会转为**长按**。

**③ 编辑工具栏**

设置 → **界面** → **工具栏** → 管理工具栏选项 → **添加命令** → 搜 `最新入库`。
适合边写边查，不需要的话可以跳过。

### 📱 关于「侧边栏视图列表」

### 排除不需要的文件夹

设置 → Latest Arrivals → 扫描 → **排除的文件夹** → **选择文件夹…**

弹出的是一个**带搜索的勾选列表**，列出 vault 里所有文件夹，勾上即排除该文件夹及其下全部内容。
不需要手打规则，手机上也能轻松操作。

需要通配符的高级用法（例如只排除某年的归档 `Archive/20??/*`）才用手写规则，
在下面的 **额外排除规则** 里。

> 勾选的文件夹用 `^文件夹/` 精确锚定，所以排除 `Archive` 不会误伤 `MyArchive/`；
> 手写规则则按 vault 完整路径做非锚定匹配。

### 配置备份：导出 / 导入

设置 → Latest Arrivals → **配置备份**

| 按钮 | 作用 |
|---|---|
| **导出** | 把当前设置写到 vault 根目录的 `latest-arrivals-settings.json` |
| **导入** | 从 vault 里选一个 JSON 文件并应用（先校验，无法识别的键直接忽略） |

文件放在 **vault 里**是刻意的：它会随 Syncthing 同步到你的其他设备，
所以可以**在电脑上导出、在手机上导入**，反过来也行。

导入会覆盖当前设置，但**只覆盖文件里出现的键**，没写的保持原样。

### 设置自愈

设置的主存储是插件目录里的 `data.json`（Obsidian 的规范做法）。
但那个文件躺在插件文件夹里，**如果你手动「删掉旧文件夹再拷新的」，它会一起被删掉**。

所以插件会**同时把设置备份到设备本地存储**（和到货台账同一处，不在插件目录里）。
`data.json` 一旦缺失，启动时会自动从备份恢复，并给出一条提示。

> 升级插件时正确做法是：**只覆盖 `main.js` / `manifest.json` / `styles.css` 三个文件**，
> 不要删掉整个 `latest-arrivals/` 文件夹。用 BRAT 更新则不会有这个问题。

---

## 5. 安装

### 方式 A：BRAT（推荐，能一键更新）

1. 在 Obsidian 里装社区插件 **BRAT**（`obsidian42-brat`）。
2. 命令面板运行 **BRAT: Add a beta plugin for testing**。
3. 填仓库地址：`iwannaknow2000/obsidian-latest-arrivals`
4. 回到 **设置 → 第三方插件**，启用「最新入库」。
5. 以后更新：命令面板运行 **BRAT: Check for updates to all beta plugins**。

> 发版只需 `npm version patch && git push --follow-tags`，
> GitHub Actions 会自动构建、跑测试，并把 `main.js` / `manifest.json` / `styles.css`
> 挂到 Release 上，手机上点一下 BRAT 就更新好了。

### ⚠️ Obsidian 设置里的「检查更新」对本插件无效

**设置 → 第三方插件 → 检查更新** 只比对**官方插件目录**里的插件。本插件未上架目录，
所以那个按钮对它永远不会有反应 —— 这不是故障。

| 安装方式 | 怎么更新 |
|---|---|
| BRAT | 设置 → BRAT → **Check for updates to all beta plugins** |
| 手动复制 | 重新覆盖那 3 个文件，然后**在多任务里划掉 Obsidian** 再打开 |
| 官方目录（未上架） | 才会被「检查更新」按钮覆盖到 |

### 方式 B：手动复制（无需 BRAT，适合网络受限时）

> macOS 端的 `.obsidian/plugins/` **不会**同步到手机，所以要手动复制一次。

1. 等 Syncthing 把 `笔记同步助手/latest-arrivals/` 同步到手机。
2. 用手机文件管理器把**整个 `latest-arrivals/` 文件夹**复制到：
   `<你的vault路径>/.obsidian/plugins/latest-arrivals/`
   目录内应有 `main.js` / `manifest.json` / `styles.css` 三个文件。
3. 重启 Obsidian → **设置 → 第三方插件** → 启用「最新入库 (Latest Arrivals)」。
4. **升级时**：重复第 2 步覆盖即可（`data.json` 不在分发包里，设置不会丢）。
   覆盖后必须**完全退出 Obsidian 再重开**（在手机的多任务界面里划掉），
   切到后台是不够的 —— 手机端不会热重载已加载的插件。

详细说明见分发包里的 `安装说明.md`。

---

## 6. 开发

```bash
npm install          # 首次
npm run dev          # 监听构建（输出 main.js，带 sourcemap）
npm test             # 全量测试：43 项逻辑断言 + 23 项运行期冒烟断言
npm run lint         # 用 Obsidian 官方 eslint-plugin-obsidianmd 跑审核规则
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

**逻辑自测（`test/run.ts`，43 项）**：拼音首字母与多音字、**三套语言包的键集合与占位符一致性**、
5 种排序键的升降序、台账首轮基线、重复扫描不重复计数、firstSeen 冻结、增量发现、
重命名继承、删除后恢复、到货窗口钳制、台账持久化往返、`estimateArrival` 边界。

**运行期冒烟（`test/smoke.cjs`，23 项）**：用打桩的 `obsidian` 模块真实加载
构建产物并跑完 `onload()`，验证命令/视图/功能区图标注册、侧边栏标签页自动挂载
（含位置与「不抢焦点」）、五键排序、台账落在设备本地存储、增量发现与忽略。

---

## 7. 已知限制

- **完全不联网**：插件不做任何网络请求，不包含遥测，也不会自我更新。

- **多音字**：只覆盖了「两个读音声母不同」的常见字（约 40 个），
  像「重庆」这类词仍会按默认读音排。完整词典需要几百 KB，与「轻量」冲突。
- **深扫描**：`adapter.list` 每个目录一次 bridge 调用，大 vault 上约 1–2 秒。
  默认节流到 180 秒一次，可在设置里调整或关闭。
- **尚未被 Obsidian 索引的文件**：深扫能发现并记录其入库时间，但点击打开时
  Obsidian 还不认识它，会提示重启。重启后它会自动出现在正常位置。
- **`data.json` 会被同步**：设置项（条数、排序偏好、忽略列表）会在设备间同步，
  但**到货台账不会**（在 localStorage 里），所以两台设备各记各的到货时间。
