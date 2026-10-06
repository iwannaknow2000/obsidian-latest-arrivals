import { App, TFile } from "obsidian";
import { ArrivalLedger } from "./ledger";
import { collectDeepScan, collectFromIndex } from "./scanner";
import { buildExcludeMatchers, isExcluded, sortItems } from "./sort";
import type { ArrivalItem, LatestArrivalsSettings, SortKey } from "./types";

export interface RefreshSummary {
  /** 索引里的 md 总数 */
  indexed: number;
  /** 深扫额外发现的、尚未被索引的 md 数 */
  unindexed: number;
  /** 本轮真正的新到货数量 */
  newCount: number;
  /** 判定为重命名并继承了原入库时间的数量 */
  inheritedCount: number;
  /** 是否执行了深度扫描 */
  didDeepScan: boolean;
  /** 深扫是否因触顶提前结束 */
  deepScanTruncated: boolean;
  durationMs: number;
  error: string;
}

/**
 * 插件的数据核心：负责「扫描 → 对账台账 → 排序 → 提供列表」。
 * UI 层（Modal / 侧栏视图）只消费这里的结果，不做任何文件系统访问。
 */
export class ArrivalsService {
  /** 全部条目（含被排除的），按当前排序键排好 */
  private all: ArrivalItem[] = [];
  /** 展示用条目（已应用排除规则） */
  private visible: ArrivalItem[] = [];

  lastRefreshAt = 0;
  lastDeepScanAt = 0;
  lastSummary: RefreshSummary | null = null;
  private refreshing: Promise<RefreshSummary> | null = null;

  constructor(
    private readonly app: App,
    private readonly ledger: ArrivalLedger,
    private readonly getSettings: () => LatestArrivalsSettings,
  ) {}

  get items(): ArrivalItem[] {
    return this.visible;
  }

  get totalTracked(): number {
    return this.all.length;
  }

  get unindexedCount(): number {
    return this.visible.filter((i) => i.unindexed).length;
  }

  /** 按指定排序取列表 */
  sorted(key: SortKey, desc: boolean): ArrivalItem[] {
    return sortItems(this.visible, key, desc);
  }

  /** 当前设置下的排序结果 */
  sortedBySettings(): ArrivalItem[] {
    const s = this.getSettings();
    return this.sorted(s.sortKey, s.sortDesc);
  }

  /** 最新入库的 N 篇 */
  latest(n: number): ArrivalItem[] {
    return sortItems(this.visible, "arrival", true).slice(0, Math.max(0, n));
  }

  /**
   * 刷新。
   *
   * 关键点：**每次都做一次全库集合差**，而不是等 Obsidian 的 create 事件。
   * 于是无论 Syncthing 是在 Obsidian 前台、后台还是完全关闭时写入的文件，
   * 都会被台账捕捉到。
   */
  refresh(opts: { deep?: boolean } = {}): Promise<RefreshSummary> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.doRefresh(opts).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(opts: { deep?: boolean }): Promise<RefreshSummary> {
    const started = Date.now();
    const settings = this.getSettings();
    const summary: RefreshSummary = {
      indexed: 0,
      unindexed: 0,
      newCount: 0,
      inheritedCount: 0,
      didDeepScan: false,
      deepScanTruncated: false,
      durationMs: 0,
      error: "",
    };

    try {
      // ---- 快路径：Obsidian 内存索引，零 IO ----
      const { files: indexed, indexPaths } = collectFromIndex(this.app);
      summary.indexed = indexed.length;

      let all = indexed;

      // ---- 深路径：直接读文件系统，抓索引还没收录的文件 ----
      const now = Date.now();
      const intervalMs = Math.max(0, settings.deepScanIntervalSec) * 1000;
      const due = now - this.lastDeepScanAt >= intervalMs;
      if (settings.deepScan && (opts.deep || due)) {
        const deep = await collectDeepScan(this.app, indexPaths);
        this.lastDeepScanAt = Date.now();
        summary.didDeepScan = true;
        summary.deepScanTruncated = deep.truncated;
        summary.unindexed = deep.files.length;
        if (deep.files.length > 0) all = indexed.concat(deep.files);
      }

      // ---- 对账台账（注意：先对账、后过滤，台账才能保持完整）----
      const result = this.ledger.reconcile(all, Date.now());
      this.all = result.items;
      summary.newCount = result.newCount;
      summary.inheritedCount = result.inheritedCount;

      // ---- 应用排除规则（仅影响展示）----
      const matchers = buildExcludeMatchers(
        settings.excludePatterns,
        settings.excludedFolders,
      );
      const ignored = new Set(settings.ignoredPaths);
      this.visible = this.all.filter(
        (i) => !isExcluded(i.path, matchers, ignored),
      );

      this.lastRefreshAt = Date.now();
    } catch (err) {
      summary.error = err instanceof Error ? err.message : String(err);
      this.lastRefreshAt = Date.now();
    }

    summary.durationMs = Date.now() - started;
    this.lastSummary = summary;
    return summary;
  }

  /** 打开一篇笔记；返回是否成功 */
  async open(item: ArrivalItem, opts: { newTab?: boolean } = {}): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(item.path);
    if (!(file instanceof TFile)) return false;
    const ws = this.app.workspace;
    const useTab = opts.newTab ?? this.getSettings().openIn === "new-tab";
    const leaf = useTab ? ws.getLeaf("tab") : ws.getLeaf(false);
    await leaf.openFile(file);
    ws.setActiveLeaf(leaf, { focus: true });
    return true;
  }

  /** 从「最新入库」里忽略一篇笔记 */
  async ignore(path: string): Promise<void> {
    const settings = this.getSettings();
    if (!settings.ignoredPaths.includes(path)) {
      settings.ignoredPaths.push(path);
    }
    this.visible = this.visible.filter((i) => i.path !== path);
  }

  /** 重建台账（下一次刷新会以文件属性重新回填入库时间） */
  rebuild(): void {
    this.ledger.reset();
    this.all = [];
    this.visible = [];
    this.lastDeepScanAt = 0;
  }
}
