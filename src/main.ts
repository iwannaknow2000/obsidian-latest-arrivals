import { Menu, Notice, Platform, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { ArrivalLedger, LocalStore } from "./ledger";
import { ArrivalsService } from "./service";
import { LatestArrivalsSettingTab } from "./settings";
import { LatestArrivalsModal } from "./ui/modal";
import { LATEST_ARRIVALS_VIEW, LatestArrivalsView } from "./ui/view";
import { applyLanguage, isLanguageSetting, t, type LanguageSetting } from "./i18n";
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

  private eventTimer: number | null = null;

  // ------------------------------------------------------------------
  // 生命周期
  // ------------------------------------------------------------------
  async onload(): Promise<void> {
    await this.loadSettings();

    // 必须在注册命令/视图之前确定语言：命令名、丝带提示、视图标题
    // 都是在注册那一刻定型的，改语言要靠重新加载插件。
    applyLanguage(this.settings.language);

    const store = new LocalStore(this.app);
    this.ledger = new ArrivalLedger(store);
    this.ledger.load();
    this.service = new ArrivalsService(this.app, this.ledger, () => this.settings);

    this.registerView(
      LATEST_ARRIVALS_VIEW,
      (leaf) => new LatestArrivalsView(leaf, this),
    );

    this.addRibbonIcon("history", t("ribbon.title"), () => {
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
      // 先把侧边栏标签页摆到正确的一侧，让用户一眼就能看到入口
      void this.applySidebarSide();
      void this.refresh(false).then(() => {
        const s = this.service.lastSummary;
        if (s && s.newCount > 0) {
          new Notice(t("notice.newArrivals", { count: s.newCount }), 4000);
        }
      });
    });
  }

  onunload(): void {
    if (this.eventTimer !== null) {
      window.clearTimeout(this.eventTimer);
      this.eventTimer = null;
    }
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
    if (!isLanguageSetting(this.settings.language)) {
      this.settings.language = DEFAULT_SETTINGS.language;
    }
  }

  async persistSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * 切换界面语言。
   *
   * 命令名称、丝带提示、视图标题都是在插件加载时注册的，Obsidian 没有提供
   * 「改名」的 API，所以只能重新加载插件让它们重新注册一次。
   */
  async setLanguage(value: LanguageSetting): Promise<void> {
    this.settings.language = value;
    await this.persistSettings();
    applyLanguage(value);
    new Notice(t("notice.languageChanged"));
    const ok = await this.reloadPlugin();
    if (!ok) new Notice(t("notice.reloadFailed"), 8000);
  }

  /**
   * 重新加载本插件。
   *
   * `app.plugins` 不是公开 API，但这是社区通行的做法（官方至今没有替代方案）。
   * 拿不到就返回 false，由调用方提示用户手动开关一次。
   */
  private async reloadPlugin(): Promise<boolean> {
    const manager = (
      this.app as unknown as {
        plugins?: {
          disablePlugin?: (id: string) => Promise<void>;
          enablePlugin?: (id: string) => Promise<void>;
        };
      }
    ).plugins;
    if (!manager?.disablePlugin || !manager?.enablePlugin) return false;
    try {
      const id = this.manifest.id;
      await manager.disablePlugin(id);
      await manager.enablePlugin(id);
      return true;
    } catch {
      return false;
    }
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
          ? t("notice.notIndexed", { name: item.name })
          : t("notice.fileNotFound", { path: item.path }),
        6000,
      );
    }
  }

  showItemMenu(item: ArrivalItem, ev: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((i) =>
      i.setTitle(t("menu.open")).setIcon("file-text").onClick(() => void this.openItem(item)),
    );
    menu.addItem((i) =>
      i
        .setTitle(t("menu.openInNewTab"))
        .setIcon("plus")
        .onClick(() => void this.openItem(item, { newTab: true })),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle(t("menu.copyLink"))
        .setIcon("link")
        .onClick(() => void copyText(`[[${item.name}]]`, t("notice.copiedLink"))),
    );
    menu.addItem((i) =>
      i
        .setTitle(t("menu.copyPath"))
        .setIcon("clipboard")
        .onClick(() => void copyText(item.path, t("notice.copiedPath"))),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle(t("menu.ignore"))
        .setIcon("eye-off")
        .onClick(() => {
          void this.ignorePath(item.path, item.name);
        }),
    );
    menu.showAtMouseEvent(ev);
  }

  async ignorePath(path: string, name: string): Promise<void> {
    await this.service.ignore(path);
    await this.persistSettings();
    this.redrawViews();
    new Notice(t("notice.ignored", { name }));
  }

  async openFullView(): Promise<void> {
    await this.applySidebarSide({ reveal: true });
    this.redrawViews();
  }

  /**
   * 判断某个 leaf 当前落在哪一侧。
   *
   * 用于发现「设置写着左侧、实际却还留在右侧」的残留 —— 见 applySidebarSide。
   */
  private leafSide(leaf: WorkspaceLeaf): SidebarSide {
    try {
      const ws = this.app.workspace;
      const root = leaf.getRoot();
      if (root === ws.leftSplit) return "left";
      if (root === ws.rightSplit) return "right";
    } catch {
      /* 极老版本没有 getRoot 时按「位置不明」处理 */
    }
    return "off";
  }

  /**
   * 按当前设置把「最新入库」标签页摆到正确的一侧。
   *
   * 为什么需要这个：`ensureSidebarTab()` 只要发现已有 leaf 就直接返回，
   * 于是把设置从「右侧」改成「左侧」时标签页根本不会搬家。
   * 而 1.1.x 的默认值是「右侧」，从旧版本升上来的设备 data.json 里存着它，
   * 新默认值覆盖不了 —— 标签页会一直卡在右侧边栏，用户在手机左侧抽屉的
   * 视图列表里自然就看不到它。
   */
  async applySidebarSide(opts: { reveal?: boolean } = {}): Promise<void> {
    const side: SidebarSide = this.settings.sidebarSide;
    const ws = this.app.workspace;
    const existing = ws.getLeavesOfType(LATEST_ARRIVALS_VIEW);

    if (side === "off") {
      for (const leaf of existing) leaf.detach();
      return;
    }

    // 已经在正确的一侧：什么都不用做
    if (existing.length > 0 && existing.every((leaf) => this.leafSide(leaf) === side)) {
      if (opts.reveal) await ws.revealLeaf(existing[0]);
      return;
    }

    // 否则先拆掉位置不对的，再重新挂到目标一侧
    for (const leaf of existing) leaf.detach();
    await this.ensureSidebarTab(opts);
  }

  /**
   * 在侧边栏挂一个「最新入库」标签页。
   *
   * 打开一次之后，Obsidian 会把它写进 `workspace-mobile.json`
   * （该文件不被 Syncthing 同步，各设备独立），之后点图标即可切换。
   *
   * 用 `workspace.ensureSideLeaf` 而不是 `getRightLeaf(false) + setViewState`：
   * 后者会把用户侧边栏里原有的「反向链接」「出链」等标签页直接替换掉。
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

    try {
      const leaf = await ws.ensureSideLeaf(LATEST_ARRIVALS_VIEW, side, {
        active: false,
        reveal: opts.reveal === true,
      });
      if (opts.reveal && leaf) await ws.revealLeaf(leaf);
    } catch {
      new Notice(t("notice.sidebarUnsupported"), 6000);
    }
  }

  /** 关闭侧边栏标签页 */
  closeSidebarTab(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(LATEST_ARRIVALS_VIEW)) {
      leaf.detach();
    }
    new Notice(t("notice.sidebarTabRemoved"));
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
      name: t("command.openQuickList"),
      icon: "history",
      callback: () => void this.openQuickList(),
    });

    this.addCommand({
      id: "open-full-view",
      name: t("command.openFullView"),
      icon: "list",
      callback: () => void this.openFullView(),
    });

    this.addCommand({
      id: "toggle-sidebar-tab",
      name: t("command.toggleSidebarTab"),
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
      name: t("command.rescan"),
      icon: "refresh-cw",
      callback: () => {
        void (async () => {
          const s = await this.service.refresh({ deep: true });
          this.redrawViews();
          new Notice(
            s.newCount > 0
              ? t("notice.foundNew", { count: s.newCount })
              : t("notice.noneNew", { count: s.indexed, ms: s.durationMs }),
          );
        })();
      },
    });

    this.addCommand({
      id: "open-latest-in-tabs",
      name: t("command.openLatestInTabs"),
      icon: "files",
      callback: () => {
        void (async () => {
          const items = this.service.latest(this.settings.quickCount);
          if (items.length === 0) {
            new Notice(t("notice.noNotes"));
            return;
          }
          for (const it of items) {
            await this.openItem(it, { newTab: true });
          }
          new Notice(t("notice.openedCount", { count: items.length }));
        })();
      },
    });

    this.addCommand({
      id: "ignore-current",
      name: t("command.ignoreCurrent"),
      icon: "eye-off",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) {
          void this.ignorePath(file.path, file.basename);
        }
        return true;
      },
    });

    this.addCommand({
      id: "rebuild-ledger",
      name: t("command.rebuildLedger"),
      icon: "database",
      callback: () => {
        void (async () => {
          this.rebuildLedger();
          await this.service.refresh({ deep: true });
          this.redrawViews();
          new Notice(t("notice.ledgerRebuilt"));
        })();
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        menu.addItem((i) =>
          i
            .setTitle(t("menu.openList"))
            .setIcon("history")
            .onClick(() => void this.openQuickList()),
        );
        menu.addItem((i) =>
          i
            .setTitle(t("menu.ignore"))
            .setIcon("eye-off")
            .onClick(() => void this.ignorePath(file.path, file.basename)),
        );
      }),
    );
  }

  private registerVaultEvents(): void {
    const schedule = () => {
      if (this.eventTimer !== null) window.clearTimeout(this.eventTimer);
      this.eventTimer = window.setTimeout(() => {
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
    new Notice(t("notice.copyFailed", { text }));
  }
}
