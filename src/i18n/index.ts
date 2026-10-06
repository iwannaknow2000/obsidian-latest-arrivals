import { moment } from "obsidian";
import { en } from "./en";
import { zhCN } from "./zh-cn";
import { zhTW } from "./zh-tw";

export type LocaleCode = "en" | "zh-CN" | "zh-TW";
/** 设置里可选的值：跟随系统，或锁定到某个语言 */
export type LanguageSetting = "auto" | LocaleCode;

const BUNDLES: Record<LocaleCode, Record<string, string>> = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
};

export const LOCALES: ReadonlyArray<{ code: LocaleCode; label: string }> = [
  { code: "en", label: "English" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
];

export const DEFAULT_LANGUAGE: LanguageSetting = "auto";

/** 把任意 BCP-47 / Obsidian locale 串归一化到我们支持的语言 */
export function normalizeLocale(raw: string | null | undefined): LocaleCode {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (!s) return "en";
  if (s.startsWith("zh")) {
    // 繁体：台湾 / 香港 / 澳门，或显式标注 Hant
    if (/(^|-)tw($|-)|(^|-)hk($|-)|(^|-)mo($|-)|hant/.test(s)) return "zh-TW";
    return "zh-CN";
  }
  return "en";
}

/**
 * 探测宿主语言。
 *
 * 首选 `moment.locale()` —— Obsidian 会把自己的界面语言写进 moment，
 * 所以它比 `navigator.language` 更贴近用户在 Obsidian 里看到的语言。
 */
export function detectHostLocale(): LocaleCode {
  try {
    const m = moment.locale();
    if (m) return normalizeLocale(m);
  } catch {
    /* moment 不可用时退回浏览器语言 */
  }
  try {
    return normalizeLocale(window.navigator?.language);
  } catch {
    /* ignore */
  }
  return "en";
}

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === "string" && value in BUNDLES;
}

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return value === "auto" || isLocaleCode(value);
}

let activeLocale: LocaleCode = "en";

/** 根据设置值解析出真正生效的语言，并把它设为当前语言 */
export function applyLanguage(setting: LanguageSetting): LocaleCode {
  activeLocale = setting === "auto" ? detectHostLocale() : setting;
  return activeLocale;
}

export function getLocale(): LocaleCode {
  return activeLocale;
}

/**
 * 取一条文案。`{name}` 形式的占位符用 `vars` 替换。
 *
 * 找不到的键会依次回退到英文包、最后回退到键名本身 —— 这样漏翻一条
 * 也不会在界面上露出空白或 `undefined`。
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const bundle = BUNDLES[activeLocale] ?? en;
  let text = bundle[key] ?? en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/** 排序键 → 本地化标签 */
export function sortKeyLabel(key: string): string {
  return t(`sort.${key}`);
}
