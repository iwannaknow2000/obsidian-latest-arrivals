import { App, normalizePath, TFile } from "obsidian";
import type { RawFileInfo } from "./types";

const MD_RE = /\.md$/i;
/**
 * 深度扫描需要跳过的目录名。
 *
 * 这里刻意**不**写死 Obsidian 的配置目录 —— 用户可以在设置里改名，
 * 运行时用 `Vault#configDir` 拿到真实值再判断。
 */
const SKIP_DIR_NAMES = new Set([
  ".trash",
  ".git",
  ".stfolder",
  ".stversions",
  "node_modules",
  ".smart-connections",
]);
/** 目录递归上限，防止在异常 vault 上跑飞 */
const MAX_DIRS = 4000;
const MAX_DEPTH = 16;

/** 从 TFile 提取文件属性（毫秒时间戳） */
export function toRawInfo(file: TFile): RawFileInfo {
  const stat = file.stat;
  return {
    path: file.path,
    name: file.basename,
    ext: file.extension,
    size: typeof stat?.size === "number" ? stat.size : 0,
    ctime: typeof stat?.ctime === "number" ? stat.ctime : 0,
    mtime: typeof stat?.mtime === "number" ? stat.mtime : 0,
    unindexed: false,
  };
}

/**
 * 快路径：直接读 Obsidian 已经建好的内存索引。
 *
 * 762 篇 md 的 metadata 全部在内容里，**零 IO、零 bridge 调用**，毫秒级。
 * 绝大多数情况（尤其是「Syncthing 在 Obsidian 关闭时同步，然后用户打开 Obsidian」）
 * 文件已经在索引里，走这条路径就够了。
 */
export function collectFromIndex(app: App): {
  files: RawFileInfo[];
  indexPaths: Set<string>;
} {
  const files: RawFileInfo[] = [];
  const indexPaths = new Set<string>();
  let list: TFile[];
  try {
    list = app.vault.getMarkdownFiles();
  } catch {
    return { files, indexPaths };
  }
  for (const f of list) {
    indexPaths.add(f.path);
    files.push(toRawInfo(f));
  }
  return { files, indexPaths };
}

export interface DeepScanResult {
  files: RawFileInfo[];
  /** 目录遍历是否因为触顶而提前结束 */
  truncated: boolean;
  scannedDirs: number;
}

/**
 * 深路径：绕过 Obsidian 索引，直接用 `adapter.list` 递归遍历文件系统。
 *
 * 用途：抓出「Syncthing 刚写好、但 Obsidian 的索引还没收录」的文件。
 * 代价是每个目录一次 bridge 调用，所以：
 *   - 只 stat 那些**不在索引里**的 `.md`；
 *   - 由调用方按 `deepScanIntervalSec` 节流；
 *   - 失败一律不影响快路径。
 */
export async function collectDeepScan(
  app: App,
  indexPaths: Set<string>,
): Promise<DeepScanResult> {
  const adapter = app.vault.adapter;
  const discovered: string[] = [];
  let scannedDirs = 0;
  let truncated = false;

  const configDir = (() => {
    try {
      return app.vault.configDir;
    } catch {
      return "";
    }
  })();

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (truncated) return;
    if (depth > MAX_DEPTH || scannedDirs >= MAX_DIRS) {
      truncated = true;
      return;
    }
    scannedDirs++;
    let listed: { files: string[]; folders: string[] };
    try {
      listed = await adapter.list(dir);
    } catch {
      return;
    }
    for (const f of listed.files) {
      if (MD_RE.test(f)) discovered.push(normalizePath(f));
    }
    for (const sub of listed.folders) {
      const base = sub.split("/").pop() ?? sub;
      if (SKIP_DIR_NAMES.has(base) || base.startsWith(".")) continue;
      // 配置目录可能被用户改成非点号开头的名字，所以还要按真实路径比一次
      if (configDir !== "" && sub === configDir) continue;
      await walk(sub, depth + 1);
      if (truncated) return;
    }
  };

  try {
    await walk("", 0);
  } catch {
    /* 遍历失败就当作没有额外文件 */
  }

  const files: RawFileInfo[] = [];
  for (const path of discovered) {
    if (indexPaths.has(path)) continue;
    try {
      const stat = await adapter.stat(path);
      if (!stat || stat.type !== "file") continue;
      const base = path.split("/").pop() ?? path;
      const dot = base.lastIndexOf(".");
      files.push({
        path,
        name: dot > 0 ? base.slice(0, dot) : base,
        ext: dot > 0 ? base.slice(dot + 1) : "",
        size: typeof stat.size === "number" ? stat.size : 0,
        ctime: typeof stat.ctime === "number" ? stat.ctime : 0,
        mtime: typeof stat.mtime === "number" ? stat.mtime : 0,
        unindexed: true,
      });
    } catch {
      /* 单个文件读不到就跳过 */
    }
  }

  return { files, truncated, scannedDirs };
}
