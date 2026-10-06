# 「最新入库」Obsidian 插件 — 实施方案

> 目标设备：iQOO 13（Android）· 同步方式：Syncthing · 知识库：`/Users/yzx224/Obsidian_Vault`（762 篇 .md / 4.2 GB）
> 参考插件：`recently-added-files`（Lemon695）——本方案针对它「抓不到 Syncthing 第三方同步文件」的根因做修复。

---

## 1. 问题根因（为什么 Recently Added Files 对 Syncthing 无效）

读了参考插件源码 `src/modules/recent-files/index.ts`，它的实现是：

```ts
this.plugin.app.workspace.onLayoutReady(() => {
    this.isInitialized = true;
    this.registerFileEvents();     // 只监听 vault.on('create' / 'modify' / 'rename' / 'delete')
});
```

- 它**只依赖 Obsidian 的 `create` 事件**，且事件注册在「布局就绪之后」。
- 事件回调里 `if (!this.isInitialized) return;`，等于把**启动时的那一轮全库扫描**彻底丢弃。
- Syncthing 绝大多数时间是**在 Obsidian 关闭状态下把文件写进 vault** 的；下次打开 Obsidian 时，这些文件是在“初始索引扫描”里被发现的，**不产生 create 事件**。
- 结论：**只要不依赖 Obsidian 事件流的“发现时机”，问题就解决了。**

---

## 2. 核心设计：设备本地「到货台账」(Arrival Ledger)

插件自己维护一张 **路径 → 首次发现时间** 的表，存哪儿是关键：

| 存储位置 | 是否随 Syncthing 同步 | 结论 |
|---|---|---|
| `data.json`（插件目录） | ✅ 会同步 | ❌ Mac 和手机互相覆盖，还会产生 `sync-conflict` 文件 |
| 知识库内任意文件 | ✅ 会同步 | ❌ 同上 |
| **`plugin.saveLocalStorage(key)`** | ❌ **设备本地、且按 vault 隔离** | ✅ **采用**（Obsidian API ≥ 1.8.7 官方提供） |

`saveLocalStorage` / `loadLocalStorage` 是 Obsidian 官方 API，注释明确写着 *“Save vault-specific value to localStorage”*——数据存在 App 本地存储里，**不进 vault、不被 Syncthing 同步**，正好满足“按设备记录到货时间”的语义（Mac 记 Mac 的到货，iQOO 记 iQOO 的到货）。

### 2.1 台账工作流程

```
插件加载 / App 回到前台 / 定时器到点 / vault 事件
        │
        ▼
  取全库文件清单（vault index，零成本）
        │
        ├── 路径已在台账 → 保留原 firstSeen（时间戳冻结，永不改写）
        │
        └── 路径不在台账 → 新到货！
                 firstSeen = min(now, max(ctime, mtime, 0))
                 （用文件系统时间戳作为“到货时刻”的估计，
                   这样同一批同步进来的多个文件能排出真实先后）
```

**首次启用（冷启动）**：全库 762 篇都不在台账里 → 用各自 `max(ctime, mtime)` 回填，**不会**把 762 篇全标成“刚刚入库”，列表立刻可用。

**重命名/移动的处理**：Syncthing 的重命名有时表现为「删 + 建」。若某路径消失的同时，出现了一个 `size` 与 `mtime` 完全相同的新路径，则直接**继承台账条目**，不判定为“新到货”。避免误报。

**清理**：路径已不存在则标记为 stale，保留 30 天后清除；台账只保留最近 2000 条。

---

## 3. 时间数据的三个口径（全部暴露给用户）

| 口径 | 来源 | 含义 | 可靠性 |
|---|---|---|---|
| **入库时间**（默认） | 台账 `firstSeen` | 这篇笔记**到这台设备**的时间 | ★★★★★ 不依赖文件属性，Syncthing 场景唯一可靠 |
| 创建时间 | `TFile.stat.ctime` | Android/Linux 上是 inode change time，对 Syncthing 写入的文件通常≈**落地时刻** | ★★★☆☆ 需真机验证 |
| 修改时间 | `TFile.stat.mtime` | Syncthing **会保留源文件 mtime** → 实际是“作者写作时间” | ★★★★★ |
| 笔记大小 | `TFile.stat.size` | 字节数（UTF-8） | ★★★★★ |

> ⚠️ Syncthing 上游有个知名提交 [lib/fs: Ignore inode change time on Android](https://github.com/syncthing/syncthing/commit/16ae1fbe5e77b682aff1c546fe20bf3904cd42df)，说明 **Android 上 ctime 语义确有坑**。因此方案不把 ctime 当唯一依据，而是「台账兜底 + ctime 当排序微调」。
>
> 插件设置页内置 **「诊断」面板**：列出最近 10 个文件的三项原始时间戳 + 三项自检（`Intl` 拼音排序是否可用 / ctime 是否合理 / 台账命中率）。真机装好后一眼就能确认 iQOO 13 上的实际行为，不必猜。

---

## 4. 排序（4 个键 × 升/降序）

`文件名(拼音首字母)` · `入库时间` · `创建时间(ctime)` · `修改时间(mtime)` · `笔记大小`，每项均可升序/降序。

### 4.1 拼音首字母排序（零依赖实现）

不引入 `pinyin` 之类的库（那会带进几百 KB 字典，违背「轻量」）。用 **ICU 拼音排序 + 声母边界串二分**：

```ts
const C = new Intl.Collator('zh-Hans-CN');
// 每个声母的“起始汉字”，按拼音序排列
const BOUND = ['阿','芭','擦','搭','蛾','发','噶','哈','击','喀','垃','妈',
               '拿','哦','啪','期','然','撒','塌','挖','昔','压','匝'];
const LETTER = ['a','b','c','d','e','f','g','h','j','k','l','m',
                'n','o','p','q','r','s','t','w','x','y','z'];
```

在二分里用拼音 collator 比较汉字落在哪个声母区间，即可得到首字母。本机 Node 已实测通过：

```
知识管理→ZSGL  本地部署→BDBS  微信→WX  数学→SX  法律→FL  经济→JJ
物理→WL  化学→HX  生物→SW  艺术→YS  中国→ZG  北京→BJ  上海→SH  云南→YN
```

- 排序键：`(首字母, 全名拼音序, 原名)` —— 即先按 A→Z 分档，档内按完整拼音。
- 已知局限：**多音字**会取 collator 的主读音（如「长沙」→`ZS` 应为 `CS`、「厦门」→`SM` 应为 `XM`）。方案：叠加一张 **<1 KB 的常见多音字覆盖表**（约 100 字，如 长/厦/重/朝/单/区/参/曾…）修正高频特例。
- 兜底：若设备 WebView 缺少 zh 拼音 collator（启动时自检 `collator.compare('张','李')` 的符号），自动降级为 Unicode 顺序，并在设置页黄字提示。

---

## 5. 交互形态：怎么“加入 Obsidian 的功能菜单”

| 入口 | API | 手机端表现 |
|---|---|---|
| 命令面板命令 | `addCommand()` | 侧边栏 ⌘/☰ → 命令面板可搜到「最新入库」 |
| 侧边栏丝带图标 | `addRibbonIcon()` | Android 左侧抽屉顶部的按钮 ☰ 旁的图标，**一点即出** |
| 设置页 | `addSettingTab()` | 设置 → 第三方插件 → 最新入库 |
| 文件右键菜单 | `file-menu` | 附赠：「标记为已读/从此列表移除」 |

命令清单（初版）：
1. `最新入库：打开列表（最近 N 篇）` ← **主入口**
2. `最新入库：全部打开（新标签页）`
3. `最新入库：重建到货台账`
4. `最新入库：标记当前笔记为已读`（从列表中排除）

**UI 形态**：主视图用 **Modal 弹层**（手机上比侧栏更快、点屏即开、大触控区），列表每行显示 `标题 + 入库时间 + 大小`，**点击行 → `leaf.openFile()` 打开笔记**（当前标签页打开，长按/右滑可在新标签打开）。另附一个 `ItemView` 侧栏视图，供桌面端做完整排序表。

---

## 6. 工程与构建

```
obsidian-latest-arrivals/
├── manifest.json          # id: latest-arrivals, isDesktopOnly: false, minAppVersion: 1.8.7
├── package.json           # 仅 devDeps: obsidian / esbuild / typescript / @types/node
├── esbuild.config.mjs     # 打包成单文件 main.js（CJS, es2018, external: obsidian）
├── src/
│   ├── main.ts            # 插件入口：注册命令/丝带/视图/设置
│   ├── ledger.ts          # 到货台账（saveLocalStorage 持久化、扫描、重命名继承、清理）
│   ├── scanner.ts         # 全库扫描：vault index 快路径 + adapter 深扫兜底
│   ├── sort.ts            # 4 种排序键 + 方向
│   ├── pinyin.ts          # 声母边界二分 + 多音字覆盖表 + 降级自检
│   ├── ui/view.ts         # ItemView 侧栏列表
│   ├── ui/modal.ts        # 快速选择弹层（主入口）
│   └── settings.ts        # 设置页 + 诊断面板
└── styles.css
```

- **无任何运行时第三方依赖**，预计 `main.js` **25–40 KB**，满足「轻量」。
- 不使用 Node/Electron API（`fs`/`path`/`electron`），全部走 `app.vault.adapter`，保证 Android 可用。
- **性能**：主路径用 `app.vault.getMarkdownFiles()` + 内存里的 `TFile.stat`，762 篇是**毫秒级、零 IO**；可选的「深度扫描」（`adapter.list` 递归）用于抓 Obsidian 索引还没收录的文件，默认仅在 App 回到前台时触发一次、并节流 ≥60 s。
- **移动端关键触发点**：`document.addEventListener('visibilitychange')` —— Android 上 Syncthing 是在 Obsidian 退到后台时同步的，**回到前台的瞬间重新扫描**是这个插件真正好用的关键。

---

## 7. 交付/上机路径

> **实测修正**：macOS 端的 `.obsidian/plugins/` **不会**同步到手机，
> 因此不能靠 Syncthing 直投插件本体。改为把可分发文件放到
> **`笔记同步助手/latest-arrivals/`**（该目录会同步），再由用户在手机上手动复制进
> `<vault>/.obsidian/plugins/latest-arrivals/`。

| 方案 | 步骤 | 耗时 | 更新方式 |
|---|---|---|---|
| **A. 分发包 + 手动复制**（当前采用） | `node scripts/deploy.mjs` → `笔记同步助手/latest-arrivals/` 同步到手机 → 手动复制进 `.obsidian/plugins/` | **几分钟** | 每次改完重新构建即自动下发到「笔记同步助手」，手机端再复制一次 |
| **B. GitHub + BRAT** | 建仓库 → GitHub Release 上传 `main.js`/`manifest.json`/`styles.css` → 手机装 `obsidian42-brat`，添加你的仓库 | 半小时 | 手机端 BRAT 一键更新（无需手动复制） |
| **C. 官方社区插件市场** | 向 `obsidianmd/obsidian-releases` 提 PR 加条目，等审核 | 数周 | 应用内自动更新 |

> 注意：`.stignore` 只忽略了 `workspace.json`/`workspace-mobile.json` 和几个 Hermes 临时目录；
> `.obsidian/*.json` 是会被同步的（vault 里已有的 `sync-conflict` 文件可以佐证），
> 但 `.obsidian/plugins/` 不会 —— 这正是必须走「笔记同步助手」中转的原因。
> 也正因如此，**台账绝不能放 `data.json`**（第 2 节的结论在这里闭环）。

---

## 8. 实施阶段

| 阶段 | 内容 | 产出 |
|---|---|---|
| **P0** | 脚手架 + `manifest.json` + esbuild 构建通 | 能加载的空白插件 |
| **P1** | 台账 + 扫描 + ctime/mtime/size 采集 | 控制台能打印 N 篇最新入库 |
| **P2** | 拼音排序 + 4 键排序 | 排序单测通过 |
| **P3** | Modal 列表 + 命令 + 丝带 + 点击打开 | **可上机的 MVP** |
| **P4** | 设置页 + 诊断面板 + 侧栏视图 | 可调 N(1–10)、排序默认值、扫描策略 |
| **P5** | 上机联调（iQOO 13 真机验证 ctime / 拼音 collator） | 用诊断面板定参 |
| **P6** | （可选）GitHub 仓库 + Release + BRAT / 社区市场 | 可分发版本 |

---

## 9. 已确认的决策

| 问题 | 决定 |
|---|---|
| 分发方式 | 分发包放「笔记同步助手/」，手机上手动复制进 `.obsidian/plugins/` |
| 扫描范围 | 只统计 `.md` 笔记 |
| 入库口径 | 默认「本机首次发现时间」（台账），另三种口径仍作为可选的排序键提供 |
| 插件名 / id | 最新入库 / `latest-arrivals` |

---

## 10. 实施结果（已完成）

| 项目 | 结果 |
|---|---|
| 插件 id / 名称 | `latest-arrivals` / 「最新入库 (Latest Arrivals)」 |
| 构建产物 | `main.js` 37 KB（gzip 12 KB），**零运行时依赖**（v1.1.0 新增侧边栏标签页入口） |
| 类型检查 | `tsc --strict --noUnusedLocals` 通过 |
| 逻辑自测 | **37 项断言全部通过**（拼音 / 排序 / 台账 / 重命名继承 / 到货窗口） |
| 运行期冒烟测试 | 用打桩 obsidian 模块真实执行 `onload`：6 个命令、1 个视图、1 个丝带图标均注册成功；扫描→对账→排序→增量发现全链路跑通；台账确认写入设备本地存储而非 `data.json` |
| 分发包 | `~/Obsidian_Vault/笔记同步助手/latest-arrivals/`（含 `安装说明.md`） |
| 本机安装 | `~/Obsidian_Vault/.obsidian/plugins/latest-arrivals/`（供 Mac 端验证） |

### 实施中发现并修正的两个问题

1. **`loadLocalStorage` 挂在 `App` 而非 `Plugin` 上** —— 按 Obsidian 官方 typings
   （`obsidian@1.13.1`）修正为 `app.loadLocalStorage` / `app.saveLocalStorage`。
2. **Android 的 `ctime` 不可信会破坏排序** —— 增加「到货窗口」约束：
   新发现文件若时间属性早于上次扫描，则直接记为本轮到货，
   保证刚同步进来的笔记一定排在最前面（见第 2 节）。

### v1.1.0：移动端入口补齐

用户反馈「只能在命令面板里打开」，经查 Obsidian 官方文档确认：
移动端的**功能区（Ribbon）**在右下角 ☰ 菜单里，且**插件加的图标默认隐藏**，
必须由用户在 设置 → 外观 → 高级 → 功能区设置 → 管理 中手动 ➕ 添加——插件无法代劳。

因此 v1.1.0 补上更可靠的入口：

- **侧边栏标签页**：启动时用 `workspace.ensureSideLeaf()`（≥1.7.2）自动挂载，
  打开一次后由 Obsidian 记在 `workspace-mobile.json`（不被同步，各设备独立）；
  可在设置里选 左侧/右侧/不挂载，并有开关命令。
  > 刻意**不用** `getRightLeaf(false) + setViewState`：那会把用户侧边栏里原有的
  > 「反向链接」「出链」等标签页直接替换掉。老版本上没有 `ensureSideLeaf` 时
  > 退化为提示文案，而不是破坏用户布局。
- 文件右键/长按菜单新增「打开『最新入库』列表」。
- 设置页新增移动端入口引导块（step-by-step 教怎么加到 ☰ 菜单）。

### 后续可选

- 发布到 GitHub（Release + BRAT），手机端即可一键更新，省去手动复制文件夹。
- 提交到 Obsidian 官方社区插件市场。

---

## 11. v1.2.0：国际化 + 移动端入口修正

### 背景

用户反馈两点：
1. 希望插件**默认英文**，能跟随系统语言，也能在设置里手动切换；
2. 想知道能不能把「最新入库」加进手机左侧抽屉底部的那份列表（文件列表 / 搜索 / 标签 / 书签 …），
   以及那排「新建笔记 / 新建文件夹 / 排序」图标按钮里。

### 结论

- 那排图标按钮是**文件列表插件自己的工具栏**，Obsidian 未开放 API，第三方插件无法添加。
- 那份视图列表是**左侧边栏的标签页列表**：插件只要把视图挂在**左侧**边栏就会出现。
  因此把 `sidebarSide` 默认值由 `right` 改为 `left`。

### 实现

- 新增 `src/i18n/`：`en`（默认，兼回退）/ `zh-CN` / `zh-TW` 三套语言包，
  `applyLanguage()` 解析设置值，`auto` 时用 `moment.locale()` 探测 Obsidian 界面语言
  （比 `navigator.language` 更贴近用户在 Obsidian 里看到的语言），失败再退回浏览器语言。
- 命令名、功能区提示、视图标题在加载时注册，Obsidian 无改名 API，
  所以切换语言时通过 `app.plugins.disablePlugin/enablePlugin` 自动重载插件（失败则提示手动开关）。
- `src/` 全部硬编码文案改走 `t()`，支持 `{name}` 占位符。

### 顺带修掉的官方审核问题

接入 `eslint-plugin-obsidianmd`（官方审核用的规则集）后发现 **29 个问题**，逐一处理：

| 问题 | 处理 |
|---|---|
| `no-unsupported-api`：用了 1.8.7 的 `App.loadLocalStorage` 却声明 `minAppVersion: 1.5.0` | `minAppVersion` 提到 **1.8.7**，并删掉 `window.localStorage` 回退分支 |
| `settings-tab/no-manual-html-headings`（7 处） | 改用 `new Setting(el).setName(x).setHeading()` |
| `ui/sentence-case` | 改英文默认后自然消解 |
| `prefer-window-timers`（5 处） | 统一 `window.setTimeout` / `window.clearTimeout` |
| `hardcoded-config-path` | 不再写死 `.obsidian`，运行时用 `Vault#configDir` 判断 |
| `no-unsafe-assignment` | 显式标注 `const value: unknown` |
| `no-deprecated` / `prefer-setting-definitions` | **有意保留**：`getSettingDefinitions()` 是 1.13.0 的新 API，用它会排除掉所有老版本用户；`display()` 至今完全可用。在 `eslint.config.mjs` 里注明理由后局部关闭 |

最终：**0 error，1 warning（已说明）**。

### 测试

- 逻辑断言 37 → **43**：新增三套语言包的键集合一致性、空文案、`{占位符}` 对齐断言。
- 打包体积 37 KB → **68 KB**（gzip 19 KB），仍为零运行时依赖。
