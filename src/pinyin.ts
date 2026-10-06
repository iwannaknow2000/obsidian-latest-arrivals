/**
 * 拼音首字母工具
 *
 * 设计目标：零第三方依赖、体积 < 1 KB。
 *
 * 原理：现代 JS 运行时的 ICU 已内置中文拼音排序（`Intl.Collator('zh')`）。
 * 我们只需要离线生成一张「声母边界表」——每个声母对应的第一个汉字——
 * 然后对任意汉字做二分查找，即可定位它属于哪个声母。
 *
 * 本机 Node 实测：
 *   知识管理→ZSGL  本地部署→BDBS  微信→WX  数学→SX  法律→FL  经济→JJ
 *   物理→WL  化学→HX  生物→SW  艺术→YS  中国→ZG  北京→BJ  上海→SH  云南→YN
 */

/** 每个声母对应的「起始汉字」，按拼音序排列（无 i / u / v 开头的音节） */
const PINYIN_BOUNDARY = "阿芭擦搭蛾发噶哈击喀垃妈拿哦啪期然撒塌挖昔压匝";
/** 与 PINYIN_BOUNDARY 逐位对齐的声母字母 */
const PINYIN_LETTERS = "abcdefghjklmnopqrstwxyz";
/** 非汉字、非字母字符统一归到这一档，排在字母之前 */
const OTHER_GROUP = "#";

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/**
 * 多音字覆盖表。
 *
 * 穷举多音字需要完整词典（几百 KB），违背「轻量」目标。
 * 但**只有当两个读音的声母不同**时才会影响首字母，这类字不到 40 个，
 * 且绝大多数场景下都能用常识定一个主读音。这里只覆盖这些「会改声母」的字。
 *
 * 取值依据：该字在中文文件名 / 笔记标题里最常见的读音。
 */
const POLYPHONE: Record<string, string> = {
  长: "C", // cháng（长江、长沙）★ collator 会误判为 Z
  厦: "X", // xià（厦门）★ collator 会误判为 S
  藏: "C", // cáng（收藏）
  传: "C", // chuán（传播）
  仇: "C", // chóu
  臭: "C", // chòu
  畜: "C", // chù（畜生）
  重: "Z", // zhòng（重要）
  单: "D", // dān
  曾: "Z", // zēng（姓氏）
  查: "C", // chá
  解: "J", // jiě
  区: "Q", // qū
  折: "Z", // zhé
  石: "S", // shí
  属: "S", // shǔ（属于）
  宿: "S", // sù（住宿）
  说: "S", // shuō
  汤: "T", // tāng
  提: "T", // tí
  调: "T", // tiáo（调整）
  圈: "Q", // quān（圈子）
  曲: "Q", // qū（曲线）
  强: "Q", // qiáng
  奇: "Q", // qí（奇怪）
  卡: "K", // kǎ（卡片）
  行: "X", // xíng（行为）
  系: "X", // xì（系统）
  会: "H", // huì（会议）
  见: "J", // jiàn（看见）
  乐: "L", // lè（快乐）
  叶: "Y", // yè（叶子）
  尾: "W", // wěi（结尾）
  吓: "X", // xià（吓人）
  便: "B", // biàn（方便）
  弹: "T", // tán（弹力）
  共: "G",
  期: "Q",
  咖: "K",
};

export type PinyinMode = "collator" | "fallback";

export interface PinyinSupport {
  mode: PinyinMode;
  /** 具体命中的 locale，便于诊断面板展示 */
  locale: string;
  /** 是否内置 ICU 中文排序可用 */
  ok: boolean;
}

function makeCollator(locale: string): Intl.Collator | null {
  try {
    return new Intl.Collator(locale, { usage: "sort", sensitivity: "variant" });
  } catch {
    return null;
  }
}

let collator: Intl.Collator | null = null;
let support: PinyinSupport | null = null;
/** 防止 initialOf → detectPinyinSupport 的递归探测 */
let detecting = false;

/**
 * 检测当前运行时是否具备中文拼音排序能力。
 * 只有在「能用声母边界二分定位到正确首字母」时才认为可用 —— 避免某些 WebView
 * 有 Intl 但缺少 zh 排序数据，导致静默给出错误顺序。
 */
export function detectPinyinSupport(): PinyinSupport {
  if (support) return support;
  if (detecting) {
    return { mode: collator ? "collator" : "fallback", locale: "", ok: !!collator };
  }

  detecting = true;
  try {
    const candidates = ["zh-Hans-CN-u-co-pinyin", "zh-Hans-CN", "zh-CN", "zh"];
    for (const locale of candidates) {
      const c = makeCollator(locale);
      if (!c) continue;

      // 自检一：拼音序 安 < 北 < 张
      const orderOk = c.compare("安", "北") < 0 && c.compare("北", "张") < 0;
      if (!orderOk) continue;

      collator = c;
      // 自检二：声母边界二分能否定位到正确首字母
      const probes: Array<[string, string]> = [
        ["知", "Z"],
        ["本", "B"],
        ["啊", "A"],
        ["新", "X"],
      ];
      const probeOk = probes.every(([ch, want]) => initialOf(ch) === want);
      if (!probeOk) {
        collator = null;
        continue;
      }

      support = { mode: "collator", locale, ok: true };
      return support;
    }
  } finally {
    detecting = false;
  }

  collator = null;
  support = { mode: "fallback", locale: "", ok: false };
  return support;
}

/** 声母边界二分：返回小写声母字母，未命中返回空串 */
function boundaryInitial(ch: string): string {
  if (!collator) return "";
  let lo = 0;
  let hi = PINYIN_BOUNDARY.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (collator.compare(ch, PINYIN_BOUNDARY[mid]) >= 0) {
      res = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return res < 0 ? "" : PINYIN_LETTERS[res];
}

/**
 * 取单个字符的排序档位字母（大写）。
 * 汉字 → 拼音首字母；西文字母 → 自身大写；数字/符号 → `#`。
 */
export function initialOf(ch: string): string {
  const override = POLYPHONE[ch];
  if (override) return override;
  if (!CJK_RE.test(ch)) {
    if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase();
    return OTHER_GROUP;
  }
  detectPinyinSupport();
  const letter = boundaryInitial(ch);
  return letter ? letter.toUpperCase() : ch;
}

/** 取整个字符串的「拼音首字母序列」 */
export function pinyinInitials(name: string): string {
  let out = "";
  for (const ch of name) out += initialOf(ch);
  return out;
}

/**
 * 供 UI 分组表头使用：取名称首字的档位（A–Z / #）。
 * 降级模式下无法得到拼音首字母，统一返回 `#`，调用方应据此隐藏分组表头。
 */
export function groupLetter(name: string): string {
  for (const ch of name) {
    const l = initialOf(ch);
    if (/^[A-Z]$/.test(l)) return l;
    if (l === OTHER_GROUP) return OTHER_GROUP;
  }
  return OTHER_GROUP;
}

/**
 * 拼音排序比较器：首字母序列 → 全名 ICU 拼音序 → 原始编码序。
 * 这样既能满足「按拼音首字母排列」，同档内又是自然的拼音顺序。
 */
export function compareByPinyin(a: string, b: string): number {
  const ia = pinyinInitials(a);
  const ib = pinyinInitials(b);
  if (ia !== ib) return ia < ib ? -1 : 1;

  detectPinyinSupport();
  if (collator) {
    const c = collator.compare(a, b);
    if (c !== 0) return c;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}
