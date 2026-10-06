import type { App } from "obsidian";
import type { ArrivalItem, RawFileInfo } from "./types";

/**
 * 设备本地存储。
 *
 * 台账**绝不能**写进 `data.json` —— 那个文件在 vault 里，会被 Syncthing 同步，
 * 导致 Mac 和手机互相覆盖、还会生成 sync-conflict 副本。
 *
 * 这里用的是 Obsidian 官方的 `App.loadLocalStorage` / `App.saveLocalStorage`
 * （自 1.8.7 起提供），它们的注释明确写着 "for this vault"：
 * 数据存在 App 本地存储里，不进 vault、不会被同步，正好符合
 * 「按设备记录到货时间」的语义。
 */
export class LocalStore {
  constructor(private readonly app: App) {}

  get<T>(key: string): T | null {
    try {
      const value: unknown = this.app.loadLocalStorage(key);
      return value === undefined || value === null ? null : (value as T);
    } catch {
      return null;
    }
  }

  set(key: string, value: unknown): void {
    try {
      this.app.saveLocalStorage(key, value);
    } catch {
      /* 配额满或不可序列化时静默失败，不影响主流程 */
    }
  }
}

export interface LedgerEntry {
  /** 首次被本机观察到的时间（epoch ms），一旦写入即冻结 */
  first: number;
  /** 上次扫描时的文件大小，用于识别「重命名」 */
  size: number;
  /** 上次扫描时的 mtime，用于识别「重命名」 */
  mtime: number;
}

export interface LedgerState {
  v: number;
  /** 上一次对账的时间，用于把「新发现」的文件夹到正确的到货窗口里 */
  lastScanAt: number;
  entries: Record<string, LedgerEntry>;
}

const LEDGER_KEY = "arrival-ledger-v1";
/** 台账条目上限，防止 vault 长期增删后无限膨胀 */
const MAX_ENTRIES = 5000;
/** 已消失路径的保留期：超过这个时间且文件确实不在了就丢弃 */
const TOMBSTONE_TTL_MS = 180 * 24 * 3600_000;
/** 允许的时钟偏差（Symcthing / 系统时钟可能略微超前） */
const CLOCK_SKEW_MS = 3600_000;

/**
 * 估计一篇笔记「到达本机」的时刻。
 *
 * - `ctime`：Android/Linux 上是 inode change time。Syncthing 写文件时由内核打上，
 *   所以对同步进来的文件通常 ≈ 真正落地时刻。
 * - `mtime`：Syncthing **会保留源文件 mtime**，所以这实际是「作者写作时间」。
 * - 取二者较大值并过滤掉明显异常值，即可在无台账时得到最接近真实的到货时刻，
 *   同一批同步进来的多个文件也因此能排出先后。
 */
export function estimateArrival(
  ctime: number,
  mtime: number,
  now: number,
): number {
  const limit = now + CLOCK_SKEW_MS;
  const candidates = [ctime, mtime].filter(
    (t) => Number.isFinite(t) && t > 0 && t <= limit,
  );
  if (candidates.length === 0) return now;
  return Math.max(...candidates);
}

export interface ReconcileResult {
  items: ArrivalItem[];
  /** 本轮真正的新到货数量（不含重命名继承） */
  newCount: number;
  /** 本轮通过 size+mtime 判定为重命名并继承了原入库时间的数量 */
  inheritedCount: number;
}

/**
 * 到货台账。
 *
 * 这是整个插件区别于 `recently-added-files` 的核心：不依赖 Obsidian 的
 * `vault.on('create')` 事件，而是每次刷新都做一次「全库集合差」。
 * 于是无论 Syncthing 是在 Obsidian 运行中还是关闭时写入的文件，都能被发现。
 */
export class ArrivalLedger {
  private state: LedgerState = { v: 1, lastScanAt: 0, entries: {} };
  private dirty = false;
  private saveTimer: number | null = null;

  constructor(private readonly store: LocalStore) {}

  load(): void {
    const raw = this.store.get<LedgerState>(LEDGER_KEY);
    if (raw && raw.entries && typeof raw.entries === "object") {
      this.state = {
        v: 1,
        lastScanAt: typeof raw.lastScanAt === "number" ? raw.lastScanAt : 0,
        entries: { ...raw.entries },
      };
    } else {
      this.state = { v: 1, lastScanAt: 0, entries: {} };
    }
  }

  /** 台账是否为空（首次启用，需要基线回填） */
  get isEmpty(): boolean {
    return Object.keys(this.state.entries).length === 0;
  }

  get size(): number {
    return Object.keys(this.state.entries).length;
  }

  /** 立即落盘 */
  flush(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    try {
      this.store.set(LEDGER_KEY, this.state);
    } catch {
      /* 忽略持久化失败 */
    }
  }

  /** 延迟落盘，避免高频刷新时反复写 localStorage */
  scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 1500);
  }

  /** 清空台账（重建索引命令使用） */
  reset(): void {
    this.state = { v: 1, lastScanAt: 0, entries: {} };
    this.flush();
  }

  /**
   * 把本轮扫描到的文件与台账对账，生成带 `firstSeen` 的条目列表。
   * 纯同步、无 IO，762 篇笔记在毫秒级完成。
   */
  reconcile(files: RawFileInfo[], now: number): ReconcileResult {
    const prev = this.state.entries;
    const next: Record<string, LedgerEntry> = {};
    const present = new Set<string>();

    /**
     * 首次启用（台账为空）：全部用文件属性回填，避免 762 篇笔记并列同一时刻。
     * 之后每一轮只可能是「真正的增量」。
     */
    const bootstrapping = Object.keys(prev).length === 0;
    const prevScanAt = this.state.lastScanAt;

    // 1) 已登记且仍在的文件：保留冻结的 firstSeen，只刷新快照
    for (const f of files) {
      present.add(f.path);
      const old = prev[f.path];
      if (old) {
        next[f.path] = { first: old.first, size: f.size, mtime: f.mtime };
      }
    }

    // 2) 从「本轮消失」的条目里建索引，用于识别重命名（Syncthing 的 rename
    //    有时表现为 删除 + 新建，这样一来一回会把旧笔记误判成新入库）
    const donors = new Map<string, { path: string; entry: LedgerEntry }[]>();
    for (const [path, entry] of Object.entries(prev)) {
      if (present.has(path)) continue;
      const key = `${entry.size}|${entry.mtime}`;
      const list = donors.get(key);
      if (list) list.push({ path, entry });
      else donors.set(key, [{ path, entry }]);
    }

    // 3) 本轮新出现的路径：先试重命名继承，否则判定为新到货
    const items: ArrivalItem[] = [];
    let newCount = 0;
    let inheritedCount = 0;

    for (const f of files) {
      const existing = next[f.path];
      let first: number;
      let isNew = false;

      if (existing) {
        first = existing.first;
      } else {
        const key = `${f.size}|${f.mtime}`;
        const list = donors.get(key);
        const donor = list && list.length > 0 ? list.shift() : undefined;
        if (donor) {
          first = donor.entry.first;
          inheritedCount++;
          delete prev[donor.path];
        } else {
          const est = estimateArrival(f.ctime, f.mtime, now);
          if (bootstrapping || prevScanAt <= 0 || est >= prevScanAt) {
            first = est;
          } else {
            /*
             * 估计值早于「上次扫描」—— 说明该文件的时间属性不可信
             * （Android 的 ctime 语义在 Syncthing 上游就有专门的规避补丁），
             * 但它确实是本轮才出现的，于是直接记为本轮到货，
             * 保证刚同步进来的笔记一定会排到列表最前面。
             */
            first = now;
          }
          isNew = true;
          newCount++;
        }
        next[f.path] = { first, size: f.size, mtime: f.mtime };
      }

      items.push({ ...f, firstSeen: first, isNew });
    }

    // 4) 保留已消失的路径一小段时间（用于重命名继承 / 误删恢复），过期丢弃
    for (const [path, entry] of Object.entries(prev)) {
      if (next[path]) continue;
      if (now - entry.first > TOMBSTONE_TTL_MS) continue;
      next[path] = entry;
    }

    this.state.entries = this.cap(next);
    this.state.lastScanAt = now;
    this.scheduleSave();

    return { items, newCount, inheritedCount };
  }

  private cap(entries: Record<string, LedgerEntry>): Record<string, LedgerEntry> {
    const paths = Object.keys(entries);
    if (paths.length <= MAX_ENTRIES) return entries;
    paths.sort((a, b) => entries[b].first - entries[a].first);
    const kept: Record<string, LedgerEntry> = {};
    for (const p of paths.slice(0, MAX_ENTRIES)) kept[p] = entries[p];
    return kept;
  }

  /** 诊断面板用：返回若干条目的原始记录 */
  sample(limit: number): Array<{ path: string; entry: LedgerEntry }> {
    return Object.entries(this.state.entries)
      .sort((a, b) => b[1].first - a[1].first)
      .slice(0, limit)
      .map(([path, entry]) => ({ path, entry }));
  }
}
