# 提交到 Obsidian 社区目录 · 操作手册

> 前置条件：**已有 Obsidian 账号** ✅
> 提交入口：<https://community.obsidian.md>

---

## ⚠️ 流程和网上多数教程不一样

以前是往 `obsidianmd/obsidian-releases` 提 PR 加一行条目。**现在不是了。**

官方现行流程（摘自 [Submit your plugin](https://docs.obsidian.md/plugins/releasing/submit-plugin)）：

1. 登录 **community.obsidian.md**（用 **Obsidian 账号**，不是 GitHub 账号）
2. 在个人资料里**关联 GitHub 账号**（用来验证仓库归属）
3. 在目录里**添加插件**（网页表单，**不是提 PR**）
4. 之后是**自动审核**，目录页面会直接列出需要修正的问题
5. 改完发一个新的 GitHub Release 即可

**你只需要提交一次**。通过之后，用户就能在 Obsidian 内直接搜索安装，之后的新版本走 GitHub Release 自动分发。

---

## 提交前：仓库已就绪（已逐条核验）

| 官方要求 | 状态 |
|---|---|
| 仓库公开 | ✅ `iwannaknow2000/obsidian-latest-arrivals` |
| 默认分支有 `README.md` | ✅ |
| 默认分支有 `LICENSE` 并标明许可 | ✅ MIT |
| 默认分支有合法 `manifest.json` | ✅ version 1.3.0 |
| 有对应版本的 Release，且含三个附件 | ✅ tag `1.3.0`，`main.js` / `manifest.json` / `styles.css` |
| **HEAD 的 manifest 版本 == Release tag** | ✅ 都是 1.3.0 |
| `id` 唯一、不含 `obsidian` | ✅ `latest-arrivals`（已对全部 8467 个已收录插件查重） |
| 描述 ≤250 字符、以句号结尾、动作陈述开头、无 emoji | ✅ 193 字符 |
| `minAppVersion` 与实际调用的 API 相符 | ✅ `1.8.7`（官方 lint 的 `no-unsupported-api` 已通过） |
| `isDesktopOnly` 与是否用 Node/Electron API 相符 | ✅ `src/` 零 Node 依赖 → `false` |
| 无 `fundingUrl`（不接受捐赠时须移除） | ✅ 未设置 |
| 命令 id 不自带插件 id 前缀 | ✅ 用 `open-quick-list` 等 |
| 已删除示例插件代码 | ✅ 无 `MyPlugin` / `SampleSettingTab` |
| 官方 lint（`eslint-plugin-obsidianmd`） | ✅ **0 error**（1 条已说明的 warning，见下） |
| 不是 fork | ✅ 见 README「与 Recently Added Files 的关系」 |
| 不联网、无遥测、不自我更新 | ✅ 无网络请求 |

**唯一一条 warning**（不阻塞）：
`settings-tab/prefer-setting-definitions` —— 建议改用 Obsidian **1.13.0** 才引入的
`getSettingDefinitions()`，这样设置项能进设置搜索。我们 `minAppVersion` 是 1.8.7，
用了会把所有更老的用户挡在门外，所以**有意保留 `display()`**，理由写在 `eslint.config.mjs` 里。

---

## 提交时要填的内容（可直接复制）

| 字段 | 值 |
|---|---|
| Repository | `iwannaknow2000/obsidian-latest-arrivals` |
| Plugin ID | `latest-arrivals` |
| Name | `Latest Arrivals` |
| Author | `iwannaknow2000` |
| Description | `Find notes that were most recently synced into your vault by Syncthing or other third-party tools, and open them in one tap. Sort by arrival, created or modified time, size, or pinyin initials.` |
| License | MIT |
| Minimum app version | `1.8.7` |
| Desktop only | No |

> 目录会自动读取**默认分支 HEAD** 的 `manifest.json`，所以表单里多数字段是自动带出的，
> 你主要确认「仓库地址」和「描述」即可。

---

## 操作步骤（已按实际界面更正）

> ⚠️ 官方文档描述的顺序容易误解。实际界面分三处：
> **Profile**（连接账号 + 个人资料）、**Plugins**（提交插件）、**Community site**（公开目录）。

### 第 1 步：连接 GitHub（不做这步无法提交）

在左侧 **Profile** 页，**往上滚**，找到 **GitHub** 一栏，点 **Connect** → 跳转 GitHub 授权。

官方原文：

> Under **GitHub**, select **Connect** to link your GitHub account.
> …and **is required before you can submit a plugin or theme**.

> ⚠️ **别关联错账号。**
>
> | | 值 |
> |---|---|
> | GitHub 用户名 login（**要用这个**） | `iwannaknow2000` |
> | GitHub 显示名 name | `yuanmc` |
> | Obsidian 账号 Username / Name | `yuan` / `mc` |
>
> 注意 `yuanmc` 只是 GitHub 的**显示名**，而 GitHub 上**另有一个用户名就叫 `yuanmc`** 的账号
> （2013 年注册、0 个仓库），**那不是你**。授权时确认选中的是 `iwannaknow2000`。

### 第 2 步：个人资料（可选，不影响提交）

同一页的 **Profile** 区域：

| 字段 | 建议 |
|---|---|
| **Username** | 公开主页地址，小写字母/数字/连字符。当前是 `yuan`，可保留 |
| **Name** | 显示名，当前是 `mc`，可保留 |
| **Bio** | 可留空 |
| **Website** | **填网址**，不是仓库路径。可填 `https://github.com/iwannaknow2000`，或留空 |
| **Social accounts** | 可留空 |

改完点 **Save**。

### 第 3 步：提交插件

左侧导航 → **Plugins** → **New plugin**。

表单只有两项：

| 字段 | 填什么 |
|---|---|
| **GitHub repository URL** | `https://github.com/iwannaknow2000/obsidian-latest-arrivals` |
| **Owner** | 选 **Myself**（你自己） |

**其他信息不用填** —— 名称、描述、版本、作者由目录自动读取你仓库默认分支的 `manifest.json`。

### 第 4 步：看自动审核结果

提交后目录会立刻跑检查，页面会列出需要修正的项。

- **全部通过** → 等人工复核后上架，用户在 Obsidian 里就能搜到
- **有报错** → 按提示改仓库，然后**发一个新的 Release**（版本号必须递增）

> 发新版本（在项目目录里跑）：
> ```bash
> npm run release -- patch     # 或 minor / major
> ```
> 自动升版本号、同步三处版本号、提交、打 tag、推送，再由 GitHub Actions 构建并发 Release。

### 附：Claim（认领）是什么

连接 GitHub 后，目录会提示你 **Claim**（认领）你拥有的仓库里**已有的**目录条目。
本项目是**全新条目**，没有可认领的，走上面第 3 步 **New plugin** 即可。

---

## 上架之后会怎样

| | 现在（BRAT） | 上架后 |
|---|---|---|
| 用户安装 | 得先装 BRAT，再填仓库地址 | 社区插件里**直接搜索安装** |
| 更新 | BRAT 走 GitHub API，手机网络一卡就废 | Obsidian 设置里的**「检查更新」直接可用** |
| 分发给别人 | 要口口相传仓库地址 | 出现在官方插件目录 |

**你现在手机上遇到的 BRAT 报错、VPN、GitHub 限流那一整串问题，上架后全部消失。**

---

## 上架后建议补的

- [ ] README 顶部加一张界面截图（目录页观感更好，非必需）
- [ ] 论坛 [Share & showcase](https://forum.obsidian.md/c/share-showcase/9) 发个帖
- [ ] Discord `#updates` 频道（需要 `developer` 角色）

---

## 提交前最后一件事

确认你已经把 **1.3.0** 装到手机上并验证过了。

如果手机上还是旧版本、且 BRAT 一直报错，**先手动覆盖那 3 个文件**再提交 ——
提交的版本应该是你亲自验证过的那一版。

---

## 附录：v1.3.0 自动审核结果与处理

首次提交（2026-10-06，draft 状态，审核版本 1.3.0）回执：

| 检查项 | 结果 | 处理 |
|---|---|---|
| **README** | ⚠️ **Warning**：README does not appear to contain English text | ✅ **已修**：`README.md` 重写为英文（99.5% English），中文内容移至 `README.zh-CN.md`，两版互链 |
| RELEASES | 🟡 Recommendation：Missing GitHub artifact attestations | ✅ **已修**：CI 增加 `actions/attest-build-provenance@v2`，为 `main.js` / `styles.css` 生成构建来源证明 |
| BEHAVIOR | 🟡 Recommendation：Vault Enumeration | ✅ **已披露**：README 新增「Permissions and data access」章节逐项说明用途 |
| BEHAVIOR | 🟡 Recommendation：Clipboard Access | ✅ **已披露**：同上（仅在你显式选择「复制笔记链接/路径」时使用，从不读取剪贴板） |
| NETWORK REQUESTS | ✅ Pass | — |
| CODE OBFUSCATION | ✅ Pass（说明生产构建的 `minify` 没被判成混淆） | — |
| Vault Read / Vault Write | ✅ Pass | — |

**产出**：`v1.3.1`。

> 注意：审核回执里的 **Warning 和 Recommendation 都不阻塞上架**，
> 文档说明「won't be installable … until any errors from the automated review are resolved」，
> 只对 error 生效。我们一条 error 都没有。
>
> 但仍值得修：README 是英文这是**硬性内容要求**，attestation 是供应链安全的正经建议。

### 修改后怎么让审核重跑

回到 <https://community.obsidian.md> 的插件页面，点 **Check for new releases**。
目录会拉取最新的 Release 与默认分支状态，重新跑一遍检查。

### 第二轮（审核 1.3.2/1.3.3）与第三轮（1.3.4）

第二轮多出了 **SOURCE CODE** 段——目录在源码上跑的 lint 比我们本地的严：

| 项目 | 结果 | 处理 |
|---|---|---|
| README 无英文内容 | ⚠️ Warning | ✅ `v1.3.1`：README 重写为英文 |
| 缺构建来源证明 | 🟡 建议 | ✅ `v1.3.1`：CI 加 `attest-build-provenance@v2`，审核已转为 **Pass** |
| `src/format.ts` 5 条 `no-unsafe-*` | 🟡 建议×5 | ✅ `v1.3.2`：根因是 `obsidian.d.ts` 的 `moment` 类型因 `skipLibCheck` 退化成 `any`。改为不使用 moment（相对时间改用 `Intl.RelativeTimeFormat`） |
| `builtin-modules` 依赖 | ⚠️ Warning | ✅ `v1.3.2`：改用 Node 内置的 `node:module` |
| `setDynamicTooltip` 弃用 ×2 | 🟡 建议 | ✅ `v1.3.4`：数值已恒显示，直接删除调用 |
| `setWarning` 弃用 | 🟡 建议 | ✅ `v1.3.4`：改用公开的 `setClass("mod-warning")` |
| Clipboard Access | 🟡 建议 | ✅ `v1.3.4`：移除复制菜单项，插件不再触碰剪贴板 |
| `display` 弃用 ×6 + `getSettingDefinitions` 未实现 | ⚠️ Warning + 🟡 建议 | 🟡 **有意保留**：替代 API 是 1.13.0 才有的，改用会要求 `minAppVersion >= 1.13.0`，把所有更老的用户挡在门外。同一取舍的两个表现 |
| Vault Enumeration | 🟡 建议 | 🟡 **无法规避**：要算出「哪些笔记是新来的」就必须遍历 vault |

**关键教训：本地 lint 必须与目录用同一套规则。**

我们最初用 `tseslint.configs.recommended`（非类型检查版），而目录用类型检查版，
导致 `no-unsafe-*` 在本地完全不可见。已改为 `recommendedTypeChecked`，
并去掉针对 `settings.ts` 的 `no-deprecated` 关闭项。现在：

```
npm run lint  →  0 error / 7 warning
目录审核      →  0 error / 同一批（同一根因展开）
```

> 没有任何 error，不阻塞上架。官方文档：
> "won't be installable … until any **errors** from the automated review are resolved."
