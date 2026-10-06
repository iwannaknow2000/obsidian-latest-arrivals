import type { LanguageSetting } from "./i18n";

/** 排序键：入库时间 / 拼音首字母 / 创建时间 / 修改时间 / 笔记大小 */
export type SortKey = "arrival" | "pinyin" | "ctime" | "mtime" | "size";

export const SORT_KEYS: readonly SortKey[] = [
  "arrival",
  "pinyin",
  "ctime",
  "mtime",
  "size",
];

/** 侧边栏标签页位置 */
export type SidebarSide = "off" | "left" | "right";

export interface LatestArrivalsSettings {
  /** 界面语言：auto = 跟随 Obsidian */
  language: LanguageSetting;
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
   * 默认放左侧：移动端左侧抽屉底部会列出该侧边栏的所有标签页
   * （文件列表 / 搜索 / 标签 / 书签 …），挂到左侧就能和它们并排出现。
   * 打开一次之后 Obsidian 会把它记在 `workspace-mobile.json` 里
   * （该文件不被 Syncthing 同步），之后一点图标即可切换。
   */
  sidebarSide: SidebarSide;
  /**
   * 排除的文件夹（vault 相对路径）。
   *
   * 与 `excludePatterns` 的分工：这里是**勾选**出来的，精确表示「整个文件夹都不看」；
   * `excludePatterns` 留给需要通配符的高级用法。
   */
  excludedFolders: string[];
  /** 额外排除规则，每行一条 glob（支持 * 和 ?） */
  excludePatterns: string;
  /** 从「最新入库」中手动忽略的路径 */
  ignoredPaths: string[];
}

export const DEFAULT_SETTINGS: LatestArrivalsSettings = {
  language: "auto",
  quickCount: 5,
  sortKey: "arrival",
  sortDesc: true,
  groupByLetter: true,
  deepScan: true,
  deepScanIntervalSec: 180,
  rescanOnForeground: true,
  openIn: "current",
  sidebarSide: "left",
  excludedFolders: [],
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
