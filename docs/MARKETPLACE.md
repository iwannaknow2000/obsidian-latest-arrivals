# 上架 Obsidian 社区目录 · 准备清单

> 目标：把「Latest Arrivals」提交到 [community.obsidian.md](https://community.obsidian.md)，
> 让用户能直接在 Obsidian 里搜到并安装。
>
> **当前决定：暂不提交，先把插件打磨好。**

---

## ⚠️ 两个和旧资料不一样的地方

1. **不再走 PR 流程。** 以前是往 `obsidianmd/obsidian-releases` 提 PR 加一行条目；
   现在改为在 **community.obsidian.md 网页上提交**，用 Obsidian 账号登录、关联 GitHub 账号后
   在表单里添加插件。
2. **需要一个 Obsidian 账号**（不是 GitHub 账号）。如果还没注册，
   去 [obsidian.md](https://obsidian.md) 注册一个，这是提交的前置条件。

审核是**自动的**，提交后目录页面会直接列出需要修正的问题；改完只要发一个新 Release 即可。

---

## 提交时需要的信息（已备好）

| 字段 | 值 |
|---|---|
| `id` | `latest-arrivals` |
| `name` | `Latest Arrivals` |
| `author` | `iwannaknow2000` |
| `repo` | `iwannaknow2000/obsidian-latest-arrivals` |
| `minAppVersion` | `1.8.7` |
| `isDesktopOnly` | `false` |
| LICENSE | MIT |

**冲突检查（已核对全部 8467 个已收录插件）：**

- `id` `latest-arrivals` —— 未被占用 ✅
- 名称含 "Latest Arrivals" —— 无重名 ✅
- repo —— 未被占用 ✅

> 目录里已有 `syncthing-integration`（Syncthing 集成）和 `syncthing-manager`（Syncthing 控制面板）
> 两个同类插件，但**都不是**「找出最近同步进来的笔记」，定位不重叠。

---

## 硬性要求逐条自检

### Submission requirements for plugins

| 要求 | 状态 |
|---|---|
| 只在有捐赠时使用 `fundingUrl` | ✅ 未设置（我们不接受捐赠） |
| `minAppVersion` 设为真正的最低兼容版本 | ✅ `1.8.7`，与实际调用的 API 一致（官方 lint 的 `no-unsupported-api` 规则已通过） |
| 描述以动作陈述开头 | ✅ "Find notes that were most recently synced…" |
| 描述 ≤ 250 字符 | ✅ 193 |
| 描述以句号结尾 | ✅ |
| 描述不含 emoji / 特殊字符 | ✅ |
| 专有名词正确大小写（Obsidian / Markdown / PDF） | ✅ |
| 使用 Node/Electron API 时必须 `isDesktopOnly: true` | ✅ `src/` 里**零** Node/Electron 依赖 |
| 命令 id 不要自带插件 id 前缀 | ✅ 用 `open-quick-list` 等，前缀由 Obsidian 自动加 |
| 删除示例插件代码 | ✅ 无 `MyPlugin` / `SampleSettingTab` 残留 |

### Developer policies

| 政策 | 状态 |
|---|---|
| 不混淆代码以隐藏用途 | ✅ 源码全公开，仅用官方示例插件同款 `minify` 生产构建 |
| 不插动态广告 | ✅ |
| 不做客户端遥测 | ✅ |
| **插件不得自我安装或自我更新** | ✅ 不联网、不下载任何东西。切换语言时通过 `app.plugins.enablePlugin()` 重载**自己**以刷新命令名，不涉及安装/更新 |
| 网络使用需在 README 声明 | ✅ **完全不联网**，无需声明 |
| 访问 vault 之外的文件需声明 | ✅ 只访问 vault 内文件 + Obsidian 自带的 `localStorage` |
| 必须含 LICENSE 并标明许可 | ✅ MIT |
| 遵守所引用代码的原始许可 | ✅ 全新实现，未复制任何第三方代码 |
| **不是 fork** | ✅ 见下 |
| 不得误用 "Obsidian" 商标 | ✅ 名称/ID 均不含 "Obsidian" |

### 关于「fork」这一条（需要特别注意）

政策写明：**fork 未经原作者书面同意不得上架**。本项目**不是 fork**：

- 只读了 Recently Added Files 的源码用于**定位问题根因**（它只监听 `create` 事件，
  所以抓不到 Obsidian 关闭期间由 Syncthing 写入的文件）；
- 实现完全不同：本项目是「全库集合差 + 设备本地到货台账」，没有一行代码来自该插件；
- 仓库是全新的，不含原始仓库的任何代码或提交历史。

README 里已明确写出这一点并致谢，避免审核时被误判。

---

## 还缺什么

- [ ] **Obsidian 账号**（提交前置条件）
- [ ] 决定是否要加一张 README 顶部的截图（可选，但能提升目录页观感）
- [ ] 你确认插件在手机上稳定可用后再提交

## 提交步骤（等你说可以时执行）

1. 登录 [community.obsidian.md](https://community.obsidian.md)，关联 GitHub 账号
2. 在表单里填入上表的 `repo`，目录会自动读取仓库默认分支 HEAD 的 `manifest.json`
3. 提交后看自动审核结果，有报错就改仓库 + 发新 Release
4. 通过后用户即可在 Obsidian 内直接搜索安装，之后版本更新走 GitHub Release 自动分发

> 注意：目录读的是**默认分支的 manifest.json**，而用户安装时下载的是
> **与 manifest 版本号相同的 Release 附件**。所以两者必须一致——我们的 CI 已经在
> tag 与 manifest 版本不一致时直接失败，这条已被强制保证。
