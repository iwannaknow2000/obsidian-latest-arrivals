/**
 * 纯逻辑自测：拼音排序 / 台账对账 / 排序键。
 * 用 esbuild 打包后由 node 直接执行（见 package.json 的 test 脚本）。
 */
import { ArrivalLedger, LocalStore, estimateArrival } from "../src/ledger";
import { compareByPinyin, detectPinyinSupport, groupLetter, pinyinInitials } from "../src/pinyin";
import { sortItems } from "../src/sort";
import { en } from "../src/i18n/en";
import { zhCN } from "../src/i18n/zh-cn";
import { zhTW } from "../src/i18n/zh-tw";
import type { ArrivalItem, RawFileInfo } from "../src/types";

/*
 * Node 里没有 window。台账为了兼容 Obsidian 的弹出窗口，统一用
 * window.setTimeout / window.clearTimeout（官方 lint 规则要求），
 * 所以这里补一个最小垫片。
 */
(globalThis as unknown as { window: unknown }).window = {
  setTimeout,
  clearTimeout,
};

let passed = 0;
const failures: string[] = [];

function ok(name: string, cond: boolean, extra = ""): void {
  if (cond) {
    passed++;
  } else {
    failures.push(`${name}${extra ? " — " + extra : ""}`);
  }
}

function eq<T>(name: string, actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(name, a === e, `期望 ${e}，实际 ${a}`);
}

// ---------------------------------------------------------------- 拼音 ----
console.log("== 拼音首字母 ==");
const support = detectPinyinSupport();
console.log("   模式:", support.mode, support.locale || "(fallback)");

if (support.ok) {
  eq("知识管理", pinyinInitials("知识管理"), "ZSGL");
  eq("本地部署", pinyinInitials("本地部署"), "BDBS");
  eq("微信", pinyinInitials("微信"), "WX");
  eq("数学", pinyinInitials("数学"), "SX");
  eq("北京", pinyinInitials("北京"), "BJ");
  eq("上海", pinyinInitials("上海"), "SH");
  eq("多音字-长沙", pinyinInitials("长沙"), "CS");
  eq("多音字-厦门", pinyinInitials("厦门"), "XM");

  ok("拼音序 安 < 北", compareByPinyin("安", "北") < 0);
  ok("拼音序 北 < 张", compareByPinyin("北", "张") < 0);
  ok("拼音序 张 > 李", compareByPinyin("张", "李") > 0);
  eq("分组字母", groupLetter("知识管理"), "Z");
  eq("分组字母-数字归#", groupLetter("2026 计划"), "#");
} else {
  console.log("   （当前运行时无拼音数据，跳过拼音断言）");
}

// ------------------------------------------------------------ 语言包 ----
console.log("== 语言包 ==");
const enKeys = Object.keys(en).sort();
eq("zh-CN 键集合与英文一致", Object.keys(zhCN).sort(), enKeys);
eq("zh-TW 键集合与英文一致", Object.keys(zhTW).sort(), enKeys);
ok("英文包里没有空文案", Object.values(en).every((v) => v.trim().length > 0));
ok("简体中文里没有空文案", Object.values(zhCN).every((v) => v.trim().length > 0));
ok("繁体中文里没有空文案", Object.values(zhTW).every((v) => v.trim().length > 0));
ok(
  "占位符在三套语言包里一一对应",
  enKeys.every((k) => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    return holes(en[k]) === holes(zhCN[k]) && holes(en[k]) === holes(zhTW[k]);
  }),
);

// ------------------------------------------------------------ 排序键 ----
console.log("== 排序 ==");
function fakeItem(over: Partial<ArrivalItem>): ArrivalItem {
  return {
    path: "a.md",
    name: "a",
    ext: "md",
    size: 0,
    ctime: 0,
    mtime: 0,
    firstSeen: 0,
    isNew: false,
    unindexed: false,
    ...over,
  };
}

const sample: ArrivalItem[] = [
  fakeItem({ path: "b.md", name: "乙", size: 300, firstSeen: 200, ctime: 10, mtime: 5 }),
  fakeItem({ path: "a.md", name: "甲", size: 100, firstSeen: 300, ctime: 20, mtime: 9 }),
  fakeItem({ path: "c.md", name: "丙", size: 200, firstSeen: 100, ctime: 30, mtime: 1 }),
];

eq(
  "按大小升序",
  sortItems(sample, "size", false).map((i) => i.name),
  ["甲", "丙", "乙"],
);
eq(
  "按大小降序",
  sortItems(sample, "size", true).map((i) => i.name),
  ["乙", "丙", "甲"],
);
eq(
  "按入库时间降序",
  sortItems(sample, "arrival", true).map((i) => i.name),
  ["甲", "乙", "丙"],
);
eq(
  "按创建时间升序",
  sortItems(sample, "ctime", false).map((i) => i.name),
  ["乙", "甲", "丙"],
);
eq(
  "按修改时间降序",
  sortItems(sample, "mtime", true).map((i) => i.name),
  ["甲", "乙", "丙"],
);

// ------------------------------------------------------------ 台账 ----
console.log("== 到货台账 ==");

/** 内存版 App，让 LocalStore 走官方 API 分支 */
function makeApp() {
  const box: Record<string, unknown> = {};
  return {
    app: {
      vault: { getName: () => "test-vault" },
      loadLocalStorage: (k: string) => (k in box ? box[k] : null),
      saveLocalStorage: (k: string, v: unknown) => {
        box[k] = v;
      },
    },
    box,
  };
}

function file(path: string, size: number, ctime: number, mtime: number): RawFileInfo {
  return { path, name: path.replace(/\.md$/, ""), ext: "md", size, ctime, mtime, unindexed: false };
}

const { app } = makeApp();
const ledger = new ArrivalLedger(new LocalStore(app as never));
ledger.load();

const NOW = 1_000_000_000_000;

// 第一轮：三篇全新文件
const r1 = ledger.reconcile(
  [file("a.md", 100, NOW - 3000, NOW - 9000), file("b.md", 200, NOW - 2000, NOW - 8000), file("c.md", 300, 0, NOW - 7000)],
  NOW,
);
eq("首轮新到货数", r1.newCount, 3);
ok(
  "首轮 firstSeen 取 max(ctime,mtime) 并排除非法 ctime",
  r1.items.find((i) => i.path === "a.md")!.firstSeen === NOW - 3000 &&
    r1.items.find((i) => i.path === "c.md")!.firstSeen === NOW - 7000,
);

// 第二轮：完全相同的文件 → 不应产生新到货，且 firstSeen 冻结
const r2 = ledger.reconcile(
  [file("a.md", 100, NOW + 5000, NOW + 5000), file("b.md", 200, NOW - 2000, NOW - 8000), file("c.md", 300, 0, NOW - 7000)],
  NOW + 10000,
);
eq("重复扫描新到货数", r2.newCount, 0);
eq(
  "firstSeen 被冻结，不随后续 mtime 变化",
  r2.items.find((i) => i.path === "a.md")!.firstSeen,
  NOW - 3000,
);

// 第三轮：新增一篇 → 只有它是新到货
const r3 = ledger.reconcile(
  [
    file("a.md", 100, NOW - 3000, NOW - 9000),
    file("b.md", 200, NOW - 2000, NOW - 8000),
    file("c.md", 300, 0, NOW - 7000),
    file("d.md", 400, NOW - 1000, NOW - 1000),
  ],
  NOW + 20000,
);
eq("增量扫描新到货数", r3.newCount, 1);
eq("增量扫描新到货路径", r3.items.filter((i) => i.isNew).map((i) => i.path), ["d.md"]);

// 第四轮：b.md 改名为 b2.md（size/mtime 不变）→ 继承原入库时间，不算新到货
const bFirst = r3.items.find((i) => i.path === "b.md")!.firstSeen;
const r4 = ledger.reconcile(
  [
    file("a.md", 100, NOW - 3000, NOW - 9000),
    file("b2.md", 200, NOW - 1500, NOW - 8000),
    file("c.md", 300, 0, NOW - 7000),
    file("d.md", 400, NOW - 1000, NOW - 1000),
  ],
  NOW + 30000,
);
eq("重命名不产生新到货", r4.newCount, 0);
eq("重命名继承计数", r4.inheritedCount, 1);
eq(
  "重命名后保留原入库时间",
  r4.items.find((i) => i.path === "b2.md")!.firstSeen,
  bFirst,
);

// 第五轮：删除 d.md 后重新出现 → 因为台账保留墓碑，仍算同一篇
const r5 = ledger.reconcile(
  [file("a.md", 100, NOW - 3000, NOW - 9000), file("b2.md", 200, NOW - 1500, NOW - 8000), file("c.md", 300, 0, NOW - 7000)],
  NOW + 40000,
);
eq("删除后列表不再包含该文件", r5.items.some((i) => i.path === "d.md"), false);

const r6 = ledger.reconcile(
  [
    file("a.md", 100, NOW - 3000, NOW - 9000),
    file("b2.md", 200, NOW - 1500, NOW - 8000),
    file("c.md", 300, 0, NOW - 7000),
    file("d.md", 400, NOW - 1000, NOW - 1000),
  ],
  NOW + 50000,
);
eq("删除后恢复不算新到货", r6.newCount, 0);

// 台账持久化往返
ledger.flush();
const ledger2 = new ArrivalLedger(new LocalStore(app as never));
ledger2.load();
eq("台账持久化后条目数", ledger2.size, ledger.size);

// estimateArrival 边界
eq("全部时间非法时回退到 now", estimateArrival(0, 0, NOW), NOW);
eq("ctime 超前于 now 时被过滤", estimateArrival(NOW + 10 * 3600_000, NOW - 5000, NOW), NOW - 5000);
eq("ctime 晚于 mtime 时取 ctime", estimateArrival(NOW - 100, NOW - 900, NOW), NOW - 100);

// ------------------------------------------------- 到货窗口约束（Android 兜底） ----
console.log("== 到货窗口约束 ==");

const { app: app3 } = makeApp();
const ledger3 = new ArrivalLedger(new LocalStore(app3 as never));
ledger3.load();

const T0 = 2_000_000_000_000;
ledger3.reconcile([file("base.md", 10, T0 - 1000, T0 - 2000)], T0);

// 上一轮扫描之后才出现的两个文件：
//   stale.md 的文件时间属性很旧（模拟 Android ctime 不可信）
//   fresh.md 的时间属性落在窗口内（正常情况）
const T1 = T0 + 60_000;
const rWin = ledger3.reconcile(
  [
    file("base.md", 10, T0 - 1000, T0 - 2000),
    file("stale.md", 20, T0 - 90 * 86400_000, T0 - 90 * 86400_000),
    file("fresh.md", 30, T0 + 30_000, T0 - 5_000),
  ],
  T1,
);
eq("窗口约束：新到货 2 篇", rWin.newCount, 2);
eq(
  "窗口约束：时间属性不可信时钳到本轮扫描时刻",
  rWin.items.find((i) => i.path === "stale.md")!.firstSeen,
  T1,
);
eq(
  "窗口约束：时间属性落在窗口内时保留原值（可排出一批文件内的先后）",
  rWin.items.find((i) => i.path === "fresh.md")!.firstSeen,
  T0 + 30_000,
);
ok(
  "窗口约束：刚到的笔记排在既有笔记前面",
  sortItems(rWin.items, "arrival", true)[0].path !== "base.md",
);

// ---------------------------------------------------------------- 结果 ----
console.log("");
if (failures.length === 0) {
  console.log(`✅ 全部 ${passed} 项断言通过`);
} else {
  console.log(`❌ ${failures.length} 项失败 / 共 ${passed + failures.length} 项`);
  for (const f of failures) console.log("   - " + f);
  process.exitCode = 1;
}
