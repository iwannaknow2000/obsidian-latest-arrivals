/** 排序键：入库时间 / 拼音首字母 / 创建时间 / 修改时间 / 笔记大小 */
export type SortKey = "arrival" | "pinyin" | "ctime" | "mtime" | "size";

export const SORT_KEY_LABELS: Record<SortKey, string> = {
  arrival: "入库时间（本机首次发现）",
  pinyin: "文件名（拼音首字母）",
  ctime: "创建时间（文件属性 ctime）",
  mtime: "修改时间（文件属性 mtime）",
  size: "笔记大小",
};

/** 侧边栏标签页位置 */
export type SidebarSide = "off" | "left" | "right";

export interface LatestArrivalsSettings {
  /** 「最新入库」快速列表显示条数，1–10 */
  quickCount: number;
  /** 列表默认排序键 */
  sortKey: SortKey;
  /** 列表默认排序方向，true = 降序 */
  sortDesc: boolean;
  /** 拼音排序时是否插入 A–Z 分组表头 */
  groupByLetter: boolean;
  /** 是否启用深度扫描（绕过 Obsidian 索引直接读文件系统） */
  deepScan: boolean;
  /** 深度扫描最小间隔（秒） */
  deepScanIntervalSec: number;
  /** 返回前台时是否自动重扫 */
  rescanOnForeground: boolean;
  /** 点击列表项时的打开方式 */
  openIn: "current" | "new-tab";
  /**
   * 侧边栏标签页位置。
   *
   * 移动端把「最新入库」做成侧边栏标签页，打开一次之后 Obsidian 会把它记在
   * `workspace-mobile.json` 里（该文件不被 Syncthing 同步），
   * 以后在侧边栏顶部点一下图标就能直接切换，比功能区图标更省事。
   */
  sidebarSide: SidebarSide;
  /** 排除路径的正则，每行一条 */
  excludePatterns: string;
  /** 从「最新入库」中手动忽略的路径 */
  ignoredPaths: string[];
}

export const DEFAULT_SETTINGS: LatestArrivalsSettings = {
  quickCount: 5,
  sortKey: "arrival",
  sortDesc: true,
  groupByLetter: true,
  deepScan: true,
  deepScanIntervalSec: 180,
  rescanOnForeground: true,
  openIn: "current",
  sidebarSide: "right",
  excludePatterns: "",
  ignoredPaths: [],
};

/** 扫描到的原始文件信息（无台账信息） */
export interface RawFileInfo {
  path: string;
  /** 文件名，不含扩展名 */
  name: string;
  ext: string;
  size: number;
  /** 文件属性创建时间（Android/Linux 上实为 inode change time） */
  ctime: number;
  /** 文件属性修改时间（Syncthing 会保留源文件的 mtime） */
  mtime: number;
  /** 该文件尚未被 Obsidian 索引收录（深度扫描独有） */
  unindexed: boolean;
}

/** 供 UI 渲染的完整条目 */
export interface ArrivalItem extends RawFileInfo {
  /** 台账记录的「到本机」时间 */
  firstSeen: number;
  /** 本轮刷新新发现 */
  isNew: boolean;
}
