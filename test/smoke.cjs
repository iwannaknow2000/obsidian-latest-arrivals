/**
 * 运行期冒烟测试。
 *
 * 用打桩的 `obsidian` 模块真实加载构建产物 `main.js`，跑完 `onload()`，
 * 覆盖：命令/视图/丝带注册、全量扫描 → 台账对账 → 排序、
 * 侧边栏标签页挂载、台账写入设备本地存储（而非 data.json）、
 * 以及「Syncthing 又推来一篇」的增量发现。
 *
 * 用法：npm run build && node test/smoke.cjs
 */
const Module = require("node:module");
const path = require("node:path");

// 把 `require("obsidian")` 指到打桩实现（npm 上的 obsidian 包只有 .d.ts，没有运行时代码）
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "obsidian") {
    return path.join(__dirname, "stub", "obsidian.cjs");
  }
  return originalResolve.call(this, request, ...rest);
};

// ---- 最小浏览器环境 ----
const memoryStore = {};
global.window = {
  addEventListener() {},
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem: (k) => (k in memoryStore ? memoryStore[k] : null),
    setItem: (k, v) => {
      memoryStore[k] = v;
    },
  },
};
global.document = { addEventListener() {}, visibilityState: "visible" };

const obsidian = require("obsidian");
const { notices } = obsidian;

let passed = 0;
const failures = [];
function ok(name, cond, extra = "") {
  if (cond) passed++;
  else failures.push(`${name}${extra ? " — " + extra : ""}`);
}

// ---- 假 vault ----
const NOW = Date.now();
const mdFiles = [
  {
    path: "Knowledge_Base/📓 知识管理/新笔记.md",
    basename: "新笔记",
    extension: "md",
    stat: { size: 1200, ctime: NOW - 60_000, mtime: NOW - 600_000 },
  },
  {
    path: "Archive/旧笔记.md",
    basename: "旧笔记",
    extension: "md",
    stat: { size: 800, ctime: NOW - 30 * 86400_000, mtime: NOW - 30 * 86400_000 },
  },
];

const store = {};
const leaves = [];

const app = {
  vault: {
    getName: () => "Obsidian_Vault",
    configDir: ".obsidian",
    getMarkdownFiles: () => mdFiles,
    getAbstractFileByPath: (p) => mdFiles.find((f) => f.path === p) ?? null,
    adapter: {
      list: async (dir) =>
        dir === ""
          ? { files: [".DS_Store"], folders: ["Knowledge_Base", "Archive", ".obsidian", ".trash"] }
          : { files: [], folders: [] },
      stat: async (p) => {
        const f = mdFiles.find((x) => x.path === p);
        return f ? { type: "file", ...f.stat } : null;
      },
    },
    on: () => ({}),
  },
  workspace: {
    activeLeaf: null,
    leftSplit: { name: "leftSplit" },
    rightSplit: { name: "rightSplit" },
    rootSplit: { name: "rootSplit" },
    onLayoutReady: (cb) => cb(),
    on: () => ({}),
    getLeavesOfType: (type) => leaves.filter((l) => l.viewType === type && !l.detached),
    getRightLeaf: () => null,
    getLeftLeaf: () => null,
    async ensureSideLeaf(type, side, options = {}) {
      const leaf = new obsidian.WorkspaceLeaf(type);
      leaf.side = side;
      leaf.active = options.active === true;
      leaves.push(leaf);
      return leaf;
    },
    getActiveFile: () => null,
    getLeaf: () => ({ openFile: async () => {} }),
    setActiveLeaf(leaf) {
      this.activeLeaf = leaf;
    },
    async revealLeaf() {},
  },
  loadLocalStorage: (k) => (k in store ? store[k] : null),
  saveLocalStorage: (k, v) => {
    store[k] = v;
  },
};
obsidian.setApp(app);

(async () => {
  /*
   * 本仓库的 package.json 带 `"type": "module"`，直接 require main.js 会被
   * Node 当成 ESM 处理。真实环境里插件的目录只有 main.js/manifest.json/styles.css，
   * Obsidian 是按 CommonJS 加载的，所以这里显式用 Module._compile 复现那条路径。
   */
  const fs = require("node:fs");
  const mainPath = path.join(__dirname, "..", "main.js");
  const mainModule = new Module(mainPath, null);
  mainModule.filename = mainPath;
  mainModule.paths = Module._nodeModulePaths(path.dirname(mainPath));
  mainModule._compile(fs.readFileSync(mainPath, "utf8"), mainPath);

  const mod = mainModule.exports;
  const Ctor = mod.default || mod;
  ok("默认导出是一个类", typeof Ctor === "function");

  const plugin = new Ctor(app, {
    id: "latest-arrivals",
    dir: ".obsidian/plugins/latest-arrivals",
  });

  await plugin.onload();
  ok("onload 执行成功", true);
  await new Promise((r) => setTimeout(r, 60));

  // ---- 注册项 ----
  const ids = plugin.commands.map((c) => c.id);
  console.log("   命令:", ids.join(", "));
  ok("注册了打开快速列表命令", ids.includes("open-quick-list"));
  ok("注册了侧边栏标签页开关命令", ids.includes("toggle-sidebar-tab"));
  ok("注册了视图", Object.keys(plugin.views).includes("latest-arrivals-view"));
  ok("注册了功能区图标", plugin.ribbons.some((r) => r.icon === "history" && r.title.length > 0),
    JSON.stringify(plugin.ribbons));

  // ---- 侧边栏标签页 ----
  const sideLeaves = leaves.filter((l) => l.viewType === "latest-arrivals-view");
  ok("启动时自动挂载了侧边栏标签页", sideLeaves.length === 1);
  ok("侧边栏标签页默认挂在左侧（那里才是移动端的视图列表）", sideLeaves[0] && sideLeaves[0].side === "left", `实际 ${sideLeaves[0] && sideLeaves[0].side}`);
  ok("侧边栏标签页不抢焦点", sideLeaves[0] && sideLeaves[0].active === false);

  // 关闭再打开
  plugin.closeSidebarTab();
  ok("关闭后侧边栏不再有该标签页", app.workspace.getLeavesOfType("latest-arrivals-view").length === 0);
  await plugin.ensureSidebarTab({ reveal: false });
  ok("可重新挂载侧边栏标签页", app.workspace.getLeavesOfType("latest-arrivals-view").length === 1);

  // ---- 侧边栏搬家：模拟从旧版本升级（设置停在右侧、标签页也在右侧）----
  for (const l of leaves) l.detach();
  leaves.length = 0;
  plugin.settings.sidebarSide = "left";
  await app.workspace.ensureSideLeaf("latest-arrivals-view", "right", {});
  ok(
    "构造出「旧版遗留：标签页在右侧」的场景",
    leaves.filter((l) => l.viewType === "latest-arrivals-view" && !l.detached && l.side === "right").length === 1,
  );
  await plugin.applySidebarSide({});
  const moved = leaves.filter((l) => l.viewType === "latest-arrivals-view" && !l.detached);
  ok("applySidebarSide 把标签页从右侧搬到了左侧", moved.length === 1 && moved[0].side === "left",
    moved.map((l) => l.side).join(",") || "没有标签页");
  ok("搬家后旧标签页已被拆除", app.workspace.getLeavesOfType("latest-arrivals-view").length === 1);

  // 同一侧出现两个重复标签页时，必须收敛成一个
  await app.workspace.ensureSideLeaf("latest-arrivals-view", "left", {});
  await app.workspace.ensureSideLeaf("latest-arrivals-view", "left", {});
  const dupBefore = app.workspace.getLeavesOfType("latest-arrivals-view").length;
  await plugin.applySidebarSide({});
  const dupAfter = app.workspace.getLeavesOfType("latest-arrivals-view").length;
  ok("构造出同一侧两个重复标签页", dupBefore === 3, `实际 ${dupBefore} 个`);
  ok("applySidebarSide 把重复标签页收敛成一个", dupAfter === 1, `实际剩下 ${dupAfter} 个`);

  // 切到「不挂载」应该全部拆掉
  plugin.settings.sidebarSide = "off";
  await plugin.applySidebarSide({});
  ok("设为「不挂载」后标签页被拆除",
    app.workspace.getLeavesOfType("latest-arrivals-view").length === 0);

  // 还原，后面的用例还依赖左侧标签页
  plugin.settings.sidebarSide = "left";
  await plugin.applySidebarSide({});

  // ---- 扫描 / 对账 ----
  const svc = plugin.service;
  console.log("   扫描摘要:", JSON.stringify(svc.lastSummary));
  ok("扫描到 2 篇笔记", svc.items.length === 2);
  ok("首轮全部计为新到货", svc.lastSummary.newCount === 2);
  ok("最新一篇是「新笔记」", svc.latest(1)[0].name === "新笔记");

  // ---- 五种排序键都要能跑通 ----
  for (const k of ["arrival", "pinyin", "ctime", "mtime", "size"]) {
    const r = svc.sorted(k, true);
    ok(`排序键 ${k} 可用`, r.length === 2, `返回 ${r.length} 条`);
  }

  // ---- 台账必须落在设备本地存储 ----
  plugin.ledger.flush();
  ok(
    "台账写入设备本地存储（而非 data.json）",
    Object.keys(store).some((k) => k.includes("arrival-ledger")),
    `实际键：${Object.keys(store).join(",")}`,
  );

  // ---- 模拟 Syncthing 又推来一篇 ----
  mdFiles.unshift({
    path: "Inbox/刚同步来的.md",
    basename: "刚同步来的",
    extension: "md",
    stat: { size: 4000, ctime: Date.now(), mtime: Date.now() - 7200_000 },
  });
  const s2 = await svc.refresh({ deep: true });
  ok("增量发现 1 篇新到货", s2.newCount === 1, `实际 ${s2.newCount}`);
  ok("刚同步来的笔记排到第一", svc.latest(1)[0].name === "刚同步来的");

  // ---- 忽略 ----
  await plugin.service.ignore("Inbox/刚同步来的.md");
  ok("忽略后不再出现在列表中", !svc.items.some((i) => i.path === "Inbox/刚同步来的.md"));

  plugin.onunload();

  console.log("");
  if (failures.length === 0) {
    console.log(`✅ 冒烟测试通过（${passed} 项）`);
  } else {
    console.log(`❌ ${failures.length} 项失败 / 共 ${passed + failures.length} 项`);
    for (const f of failures) console.log("   - " + f);
    process.exitCode = 1;
  }
  void notices;
})().catch((e) => {
  console.error("❌ 冒烟测试崩溃：", e);
  process.exit(1);
});
