import { moment } from "obsidian";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i === 0 ? 0 : v >= 10 ? 0 : 1;
  return `${v.toFixed(digits)} ${units[i]}`;
}

/** 绝对时间：2026-10-06 16:52 */
export function formatDateTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  return moment(ts).format("YYYY-MM-DD HH:mm");
}

/** 相对时间：3 分钟前 / 2 天前 */
export function formatRelative(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  return moment(ts).fromNow();
}

/** 距离现在是否足够近，用于「NEW」高亮 */
export function isFresh(ts: number, now: number, windowMs = 24 * 3600_000): boolean {
  return Number.isFinite(ts) && ts > 0 && now - ts < windowMs;
}
