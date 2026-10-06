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

## 操作步骤

### 第 1 步：关联 GitHub

1. 打开 <https://community.obsidian.md> 并登录
2. 进入个人资料 / 账号设置，找到 **GitHub** 一项，点关联并授权
3. 授权后目录才能确认这个仓库是你的

### 第 2 步：添加插件

1. 在目录里找 **Add plugin** / **Submit a plugin**（个人资料页或侧栏）
2. **Repository** 填 `iwannaknow2000/obsidian-latest-arrivals`
3. 确认自动带出的信息，描述可按上表核对
4. 提交

### 第 3 步：看自动审核结果

提交后目录会立刻跑检查，页面会列出需要修正的项。

- **全部通过** → 等人工复核后上架，用户在 Obsidian 里就能搜到
- **有报错** → 按提示改仓库，然后**发一个新的 Release**（版本号必须递增）

> 发新版本的命令（在项目目录里跑）：
> ```bash
> npm run release -- patch     # 或 minor / major
> ```
> 会自动升版本号、同步三处版本号、提交、打 tag、推送，
> 再由 GitHub Actions 构建并发 Release。

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
