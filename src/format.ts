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

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 绝对时间：2026-10-06 16:52
 *
 * 刻意手工拼装而不是 `moment().format()`：输出与语言无关，
 * 而且不必为了格式化去依赖 Obsidian 暴露的 moment ——
 * 它的类型在 `skipLibCheck` 下会退化成 `any`，污染整条调用链
 * （官方目录的源码检查会因此报一串 no-unsafe-* 警告）。
 */
export function formatDateTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  const d = new Date(ts);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    ` ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

/** 相对时间的单位表，从大到小 */
const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600_000],
  ["month", 30 * 24 * 3600_000],
  ["week", 7 * 24 * 3600_000],
  ["day", 24 * 3600_000],
  ["hour", 3600_000],
  ["minute", 60_000],
  ["second", 1000],
];

function relativeFormatter(): Intl.RelativeTimeFormat | null {
  try {
    return new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" });
  } catch {
    return null;
  }
}

/**
 * 相对时间：3 分钟前 / 3 minutes ago
 *
 * 用 `Intl.RelativeTimeFormat` 而不是 moment：它是标准 Web API，
 * 且能**跟随插件自己的语言设置** —— 用 moment 的话会跟着 Obsidian 的界面语言走，
 * 两者不一致时同一个界面里会出现两种语言。
 */
export function formatRelative(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "—";

  const rtf = relativeFormatter();
  if (!rtf) return formatDateTime(ts);

  const diff = ts - Date.now(); // 负数 = 过去
  const abs = Math.abs(diff);

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms || unit === "second") {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return rtf.format(0, "second");
}

/** 距离现在是否足够近，用于「NEW」高亮 */
export function isFresh(ts: number, now: number, windowMs = 24 * 3600_000): boolean {
  return Number.isFinite(ts) && ts > 0 && now - ts < windowMs;
}
