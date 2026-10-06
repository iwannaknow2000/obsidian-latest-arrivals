import { moment } from "obsidian";
import { getLocale } from "./i18n";

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

/**
 * 把 moment 实例切到插件当前语言。
 *
 * moment 自己是按 Obsidian 的界面语言走的，而本插件允许单独设置语言；
 * 如果两者不一致，「3 分钟前」这类相对时间就会跟界面其他部分不同语言。
 */
function localizedMoment(ts: number) {
  const m = moment(ts);
  try {
    m.locale(getLocale() === "en" ? "en" : getLocale());
  } catch {
    /* 该 locale 未加载时保持 Obsidian 的默认语言 */
  }
  return m;
}

/** 绝对时间：2026-10-06 16:52（不随语言变化） */
export function formatDateTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  return moment(ts).format("YYYY-MM-DD HH:mm");
}

/** 相对时间：3 分钟前 / 3 minutes ago */
export function formatRelative(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  return localizedMoment(ts).fromNow();
}

/** 距离现在是否足够近，用于「NEW」高亮 */
export function isFresh(ts: number, now: number, windowMs = 24 * 3600_000): boolean {
  return Number.isFinite(ts) && ts > 0 && now - ts < windowMs;
}
