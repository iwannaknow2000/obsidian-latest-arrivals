import { compareByPinyin } from "./pinyin";
import type { ArrivalItem, SortKey } from "./types";

/**
 * 排序。五种键各自支持升 / 降序。
 *
 * `pinyin` 用的是「逐字拼音首字母序列 → 全名 ICU 拼音序 → 原始编码序」，
 * 既满足「按拼音首字母排列」，同档内又是自然的拼音顺序。
 */
export function sortItems(
  items: ArrivalItem[],
  key: SortKey,
  desc: boolean,
): ArrivalItem[] {
  const dir = desc ? -1 : 1;
  return items.slice().sort((a, b) => {
    let c = 0;
    switch (key) {
      case "pinyin":
        c = compareByPinyin(a.name, b.name);
        break;
      case "size":
        c = a.size - b.size;
        break;
      case "ctime":
        c = a.ctime - b.ctime;
        break;
      case "mtime":
        c = a.mtime - b.mtime;
        break;
      case "arrival":
      default:
        c = a.firstSeen - b.firstSeen;
        break;
    }
    // 主键相同则按路径兜底，保证结果稳定可复现
    if (c !== 0) return c * dir;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
}

/** 简单 glob → 正则，用于排除路径配置（每行一条，支持 * 和 ?） */
export function globToRegExp(pattern: string): RegExp | null {
  const trimmed = pattern.trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  try {
    return new RegExp(body, "i");
  } catch {
    return null;
  }
}

/**
 * 把「被排除的文件夹」编译成一条精确的正则。
 *
 * 用 `^` 锚定前缀而不是复用 glob：`Archive` 不应误伤 `MyArchive/`，
 * 但必须覆盖它下面任意层级的所有文件。
 */
export function folderToRegExp(folder: string): RegExp | null {
  const trimmed = folder.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return null;
  const escaped = trimmed.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  try {
    return new RegExp(`^${escaped}/`, "i");
  } catch {
    return null;
  }
}

export function buildExcludeMatchers(
  text: string,
  folders: readonly string[] = [],
): RegExp[] {
  const fromFolders = folders
    .map((folder) => folderToRegExp(folder))
    .filter((r): r is RegExp => r !== null);
  const fromText = text
    .split(/\r?\n/)
    .map((line) => globToRegExp(line))
    .filter((r): r is RegExp => r !== null);
  return [...fromFolders, ...fromText];
}

export function isExcluded(
  path: string,
  matchers: RegExp[],
  ignored: ReadonlySet<string>,
): boolean {
  if (ignored.has(path)) return true;
  for (const m of matchers) {
    if (m.test(path)) return true;
  }
  return false;
}
