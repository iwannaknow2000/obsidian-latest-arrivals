import { Menu, Notice, Platform, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { ArrivalLedger, LocalStore } from "./ledger";
import { ArrivalsService } from "./service";
import { LatestArrivalsSettingTab } from "./settings";
import { LatestArrivalsModal } from "./ui/modal";
import {
  LATEST_ARRIVALS_VIEW,
  LatestArrivalsView,
} from "./ui/view";
import {
  DEFAULT_SETTINGS,
  type ArrivalItem,
  type LatestArrivalsSettings,
  type SidebarSide,
  type SortKey,
} from "./types";

/** 文件事件聚合窗口：vault 事件可能成串触发，避免每个文件都跑一次全库对账 */
const EVENT_DEBOUNCE_MS = 2000;

export default class LatestArrivalsPlugin extends Plugin {
  settings: LatestArrivalsSettings = { ...DEFAULT_SETTINGS };
  ledger!: ArrivalLedger;
  service!: ArrivalsService;

  private eventTimer: ReturnType<typeof setTimeout> | null = null;

  // ------------------------------------------------------------------
  // 生命周期
  // ------------------------------------------------------------------
  async onload(): Promise<void> {
    await this.loadSettings();

    const store = new LocalStore(this.app);
    this.ledger = new ArrivalLedger(store);
    this.ledger.load();
    this.service = new ArrivalsService(this.app, this.ledger, () => this.settings);

    this.registerView(
      LATEST_ARRIVALS_VIEW,
      (leaf) => new LatestArrivalsView(leaf, this),
    );

    this.addRibbonIcon("history", "最新入库", () => {
      void this.openQuickList();
    });

    this.registerAllCommands();
    this.addSettingTab(new LatestArrivalsSettingTab(this.app, this));

    // 移动端关键：Syncthing 是在 Obsidian 退到后台时同步的，
    // 回到前台的这一下必须重扫，否则用户看到的永远是旧列表。
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState === "visible" && this.settings.rescanOnForeground) {
        void this.refresh(false);
      }
    });
    this.registerDomEvent(window, "focus", () => {
      if (this.settings.rescanOnForeground) void this.refresh(false);
    });

    this.registerVaultEvents();

    this.app.workspace.onLayoutReady(() => {
      // 先把侧边栏标签页挂上去，让用户一眼就能看到入口
      void this.ensureSidebarTab();
      void this.refresh(false).then(() => {
        const s = this.service.lastSummary;
        if (s && s.newCount > 0) {
          new Notice(`「最新入库」发现 ${s.newCount} 篇新笔记`, 4000);
        }
      });
    });
  }

  onunload(): void {
    if (this.eventTimer) clearTimeout(this.eventTimer);
    this.ledger?.flush();
  }

  // ------------------------------------------------------------------
  // 设置
  // ------------------------------------------------------------------
  async loadSettings(): Promise<void> {
    const raw = (await this.loadData()) as Partial<LatestArrivalsSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
    if (!Array.isArray(this.settings.ignoredPaths)) this.settings.ignoredPaths = [];
    this.settings.quickCount = clampInt(this.settings.quickCount, 1, 10, 5);
    if (!["off", "left", "right"].includes(this.settings.sidebarSide)) {
      this.settings.sidebarSide = DEFAULT_SETTINGS.sidebarSide;
    }
  }

  async persistSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // ------------------------------------------------------------------
  // 供 UI 层调用的接口（同时实现 QuickModalHost 与 ViewHost）
  // ------------------------------------------------------------------
  get isMobile(): boolean {
    return Platform.isMobile;
  }

  get getQuickCount(): () => number {
    return () => this.settings.quickCount;
  }

  get ledgerSize(): number {
    return this.ledger.size;
  }

  sampleLedger(n: number): ReturnType<ArrivalLedger["sample"]> {
    return this.ledger.sample(n);
  }

  getSort(): { key: SortKey; desc: boolean; group: boolean } {
    return {
      key: this.settings.sortKey,
      desc: this.settings.sortDesc,
      group: this.settings.groupByLetter,
    };
  }

  setSort(patch: { key?: SortKey; desc?: boolean; group?: boolean }): void {
    if (patch.key !== undefined) this.settings.sortKey = patch.key;
    if (patch.desc !== undefined) this.settings.sortDesc = patch.desc;
    if (patch.group !== undefined) this.settings.groupByLetter = patch.group;
    void this.persistSettings();
  }

  async refresh(deep = false): Promise<void> {
    await this.service.refresh({ deep });
    this.redrawViews();
  }

  redrawViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(LATEST_ARRIVALS_VIEW)) {
      const view = leaf.view;
      if (view instanceof LatestArrivalsView) view.render();
    }
  }

  rebuildLedger(): void {
    this.service.rebuild();
    this.ledger.flush();
  }

  async openItem(item: ArrivalItem, opts: { newTab?: boolean } = {}): Promise<void> {
    const ok = await this.service.open(item, opts);
    if (!ok) {
      new Notice(
        item.unindexed
          ? `《${item.name}》还没被 Obsidian 索引。插件已经记录了它的入库时间，重启 Obsidian 后就能正常打开。`
          : `找不到文件：${item.path}`,
        6000,
      );
    }
  }

  showItemMenu(item: ArrivalItem, ev: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((i) =>
      i
        .setTitle("打开")
        .setIcon("file-text")
        .onClick(() => void this.openItem(item)),
    );
    menu.addItem((i) =>
      i
        .setTitle("在新标签页打开")
        .setIcon("plus")
        .onClick(() => void this.openItem(item, { newTab: true })),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("复制笔记链接")
        .setIcon("link")
        .onClick(() => void copyText(`[[${item.name}]]`, "已复制 [[笔记链接]]")),
    );
    menu.addItem((i) =>
      i
        .setTitle("复制文件路径")
        .setIcon("clipboard")
        .onClick(() => void copyText(item.path, "已复制路径")),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("从「最新入库」中忽略")
        .setIcon("eye-off")
        .onClick(() => {
          void this.service.ignore(item.path).then(async () => {
            await this.persistSettings();
            this.redrawViews();
            new Notice(`已忽略《${item.name}》`);
          });
        }),
    );
    menu.showAtMouseEvent(ev);
  }

  async openFullView(): Promise<void> {
    await this.ensureSidebarTab({ reveal: true });
    this.redrawViews();
  }

  /**
   * 在侧边栏挂一个「最新入库」标签页。
   *
   * 这是移动端最省事的入口：标签页一旦打开，Obsidian 会把它写进
   * `workspace-mobile.json`（该文件不被 Syncthing 同步，各设备独立），
   * 之后在侧边栏顶部点图标即可切换，不需要每次走命令面板。
   *
   * 优先用 `workspace.ensureSideLeaf`（≥ 1.7.2，不会顶掉侧边栏里已有的视图）；
   * 老版本上没有这个 API 时退化为「提示用户手动打开一次」，
   * 而不是用 `getRightLeaf(false) + setViewState` —— 那样会把用户
   * 侧边栏里原有的「反向链接」「出链」等标签页直接替换掉。
   */
  async ensureSidebarTab(opts: { reveal?: boolean } = {}): Promise<void> {
    const side: SidebarSide = this.settings.sidebarSide;
    if (side === "off") return;

    const ws = this.app.workspace;
    const existing = ws.getLeavesOfType(LATEST_ARRIVALS_VIEW)[0];
    if (existing) {
      if (opts.reveal) await ws.revealLeaf(existing);
      return;
    }

    const withEnsure = ws as unknown as {
      ensureSideLeaf?: (
        type: string,
        side: "left" | "right",
        options?: { active?: boolean; reveal?: boolean; split?: boolean },
      ) => Promise<WorkspaceLeaf>;
    };

    if (typeof withEnsure.ensureSideLeaf !== "function") {
      new Notice(
        "当前 Obsidian 版本不支持自动挂载侧边栏标签页，请用命令「打开完整列表」打开一次，之后它会常驻侧边栏。",
        6000,
      );
      return;
    }

    try {
      const leaf = await withEnsure.ensureSideLeaf(LATEST_ARRIVALS_VIEW, side, {
        active: false,
        reveal: opts.reveal === true,
      });
      if (opts.reveal && leaf) await ws.revealLeaf(leaf);
    } catch (err) {
      console.warn("[latest-arrivals] 挂载侧边栏标签页失败", err);
    }
  }

  /** 关闭侧边栏标签页 */
  closeSidebarTab(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(LATEST_ARRIVALS_VIEW)) {
      leaf.detach();
    }
    new Notice("已从侧边栏移除「最新入库」标签页");
  }

  async openQuickList(): Promise<void> {
    if (this.service.items.length === 0 && !this.service.lastRefreshAt) {
      await this.refresh(false);
    }
    new LatestArrivalsModal(this.app, this).open();
  }

  // ------------------------------------------------------------------
  // 内部
  // ------------------------------------------------------------------
  private registerAllCommands(): void {
    this.addCommand({
      id: "open-quick-list",
      name: "打开最新入库列表",
      icon: "history",
      callback: () => void this.openQuickList(),
    });

    this.addCommand({
      id: "open-full-view",
      name: "在侧边栏打开完整列表（含排序）",
      icon: "list",
      callback: () => void this.openFullView(),
    });

    this.addCommand({
      id: "toggle-sidebar-tab",
      name: "在侧边栏显示/隐藏「最新入库」标签页",
      icon: "panel-right",
      callback: () => {
        if (this.app.workspace.getLeavesOfType(LATEST_ARRIVALS_VIEW).length > 0) {
          this.closeSidebarTab();
        } else {
          void this.ensureSidebarTab({ reveal: true });
        }
      },
    });

    this.addCommand({
      id: "rescan",
      name: "立即重新扫描",
      icon: "refresh-cw",
      callback: () => {
        void (async () => {
          const s = await this.service.refresh({ deep: true });
          this.redrawViews();
          new Notice(
            s.newCount > 0
              ? `发现 ${s.newCount} 篇新入库笔记`
              : `没有新笔记（扫描 ${s.indexed} 篇 · ${s.durationMs} ms）`,
          );
        })();
      },
    });

    this.addCommand({
      id: "open-latest-in-tabs",
      name: "在新标签页打开最新入库的若干篇",
      icon: "files",
      callback: () => {
        void (async () => {
          const items = this.service.latest(this.settings.quickCount);
          if (items.length === 0) {
            new Notice("台账里还没有笔记");
            return;
          }
          for (const it of items) {
            await this.openItem(it, { newTab: true });
          }
          new Notice(`已打开 ${items.length} 篇`);
        })();
      },
    });

    this.addCommand({
      id: "ignore-current",
      name: "忽略当前笔记（从最新入库中移除）",
      icon: "eye-off",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) {
          void this.service.ignore(file.path).then(async () => {
            await this.persistSettings();
            this.redrawViews();
            new Notice(`已忽略《${file.basename}》`);
          });
        }
        return true;
      },
    });

    this.addCommand({
      id: "rebuild-ledger",
      name: "重建到货台账",
      icon: "database",
      callback: () => {
        void (async () => {
          this.rebuildLedger();
          await this.service.refresh({ deep: true });
          this.redrawViews();
          new Notice("已重建到货台账");
        })();
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        menu.addItem((i) =>
          i
            .setTitle("打开「最新入库」列表")
            .setIcon("history")
            .onClick(() => void this.openQuickList()),
        );
        menu.addItem((i) =>
          i
            .setTitle("从「最新入库」中忽略")
            .setIcon("eye-off")
            .onClick(() => {
              void this.service.ignore(file.path).then(async () => {
                await this.persistSettings();
                this.redrawViews();
              });
            }),
        );
      }),
    );
  }

  private registerVaultEvents(): void {
    const schedule = () => {
      if (this.eventTimer) clearTimeout(this.eventTimer);
      this.eventTimer = setTimeout(() => {
        this.eventTimer = null;
        void this.refresh(false);
      }, EVENT_DEBOUNCE_MS);
    };

    this.registerEvent(this.app.vault.on("create", () => schedule()));
    this.registerEvent(this.app.vault.on("modify", () => schedule()));
    this.registerEvent(this.app.vault.on("delete", () => schedule()));
    this.registerEvent(this.app.vault.on("rename", () => schedule()));
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

async function copyText(text: string, okMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    new Notice(okMessage);
  } catch {
    new Notice("复制失败：" + text);
  }
}
