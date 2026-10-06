import { Menu, Notice, Platform, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { ArrivalLedger, LocalStore } from "./ledger";
import { ArrivalsService } from "./service";
import { LatestArrivalsSettingTab } from "./settings";
import { LatestArrivalsModal } from "./ui/modal";
import { LATEST_ARRIVALS_VIEW, LatestArrivalsView } from "./ui/view";
import {
  exportWithNotice,
  parseSettingsFile,
  readVaultFile,
  SettingsImportModal,
} from "./settings-io";
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

/**
 * 设置的设备本地备份。
 *
 * 设置的主存储是插件目录里的 `data.json`（Obsidian 的规范做法），
 * 但那个文件躺在插件文件夹里 —— 用户手动「删掉旧文件夹再拷新的」时
 * 会连它一起删掉，辛苦配好的排除路径、排序偏好就全没了。
 * 所以在设备本地存储里再留一份，`data.json` 缺失时自动恢复。
 */
const SETTINGS_BACKUP_KEY = "settings-backup-v1";

export default class LatestArrivalsPlugin extends Plugin {
  settings: LatestArrivalsSettings = { ...DEFAULT_SETTINGS };
  ledger!: ArrivalLedger;
  service!: ArrivalsService;

  private localStore!: LocalStore;
  private eventTimer: number | null = null;
  /** 本次启动是否从设备本地备份恢复了设置（用于给用户一个提示） */
  private restoredFromBackup = false;

  // ------------------------------------------------------------------
  // 生命周期
  // ------------------------------------------------------------------
  async onload(): Promise<void> {
    this.localStore = new LocalStore(this.app);
    await this.loadSettings();

    // 必须在注册命令/视图之前确定语言：命令名、丝带提示、视图标题
    // 都是在注册那一刻定型的，改语言要靠重新加载插件。
    applyLanguage(this.settings.language);

    this.ledger = new ArrivalLedger(this.localStore);
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
      if (this.restoredFromBackup) {
        new Notice(t("notice.settingsRestored"), 6000);
      }
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
    const hasRaw = raw !== null && typeof raw === "object" && Object.keys(raw).length > 0;

    // data.json 不见了（手动覆盖插件目录、重装、被清理工具删掉）时，
    // 从设备本地备份恢复，而不是静默回落成默认值。
    const backup = hasRaw
      ? null
      : this.localStore.get<Partial<LatestArrivalsSettings>>(SETTINGS_BACKUP_KEY);
    this.restoredFromBackup = backup !== null;

    this.settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...(raw ?? {}), ...(backup ?? {}) });

    // 立刻回写一次：既保证 data.json 存在，也把（可能刚恢复的）设置写进备份
    await this.persistSettings();
  }

  async persistSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.localStore.set(SETTINGS_BACKUP_KEY, this.settings);
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

    // 优先保留「已经在目标一侧」的那个；位置判断不出来时就保留第一个，
    // 不对它做无谓的拆建（否则每次加载都会重置用户的标签页顺序）。
    const onTargetSide = existing.find((leaf) => this.leafSide(leaf) === side);
    const keep = onTargetSide ?? existing[0];

    // 无论「位置不对」还是「同一侧出现重复」，都只留一个。
    // 这里必须无条件去重：v1.2.1 只比对了位置，
    // 两个都落在左侧时 every() 成立，于是两个都被留下 —— 用户就会看到两个。
    for (const leaf of existing) {
      if (leaf !== keep) leaf.detach();
    }

    if (!keep) {
      await this.ensureSidebarTab(opts);
      return;
    }

    // 明确知道它落在另一侧 → 拆掉重挂到目标侧
    const current = this.leafSide(keep);
    if (current !== "off" && current !== side) {
      keep.detach();
      await this.ensureSidebarTab(opts);
      return;
    }

    if (opts.reveal) await ws.revealLeaf(keep);
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

  /** 把当前设置导出到 vault 根目录的 JSON */
  async exportSettings(): Promise<void> {
    await exportWithNotice(this.app, this.settings, this.manifest.version);
  }

  /** 打开配置文件选择器 */
  openImportPicker(onDone: () => void): void {
    new SettingsImportModal(this.app, (file) => {
      void this.importSettingsFrom(file).then(onDone);
    }).open();
  }

  /** 从 vault 里的某个 JSON 文件导入设置 */
  async importSettingsFrom(file: TFile): Promise<void> {
    let text: string;
    try {
      text = await readVaultFile(this.app, file);
    } catch {
      new Notice(t("notice.settingsImportFailed", { path: file.path }), 8000);
      return;
    }

    const parsed = parseSettingsFile(text);
    if (!parsed) {
      new Notice(t("notice.settingsImportInvalid", { path: file.path }), 8000);
      return;
    }

    const previousLanguage = this.settings.language;
    // 已知键合并：文件里没写的保持当前值，写了的覆盖
    this.settings = normalizeSettings({ ...this.settings, ...parsed });
    await this.persistSettings();
    await this.refresh(false);
    await this.applySidebarSide();
    new Notice(t("notice.settingsImported"));

    // 语言变了：命令名称是在加载时注册的，必须重载插件才能刷新
    if (this.settings.language !== previousLanguage) {
      await this.setLanguage(this.settings.language);
    } else {
      this.redrawViews();
    }
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

/** 设置归一化：loadSettings 与「导入配置」共用，保证两条入口的校验完全一致 */
function normalizeSettings(input: LatestArrivalsSettings): LatestArrivalsSettings {
  const out = { ...input };
  if (!Array.isArray(out.ignoredPaths)) out.ignoredPaths = [];
  out.quickCount = clampInt(out.quickCount, 1, 10, 5);
  out.deepScanIntervalSec = clampInt(out.deepScanIntervalSec, 0, 3600, 180);
  if (!["off", "left", "right"].includes(out.sidebarSide)) {
    out.sidebarSide = DEFAULT_SETTINGS.sidebarSide;
  }
  if (!isLanguageSetting(out.language)) out.language = DEFAULT_SETTINGS.language;
  if (typeof out.excludePatterns !== "string") out.excludePatterns = "";
  if (out.openIn !== "current" && out.openIn !== "new-tab") out.openIn = "current";
  return out;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
