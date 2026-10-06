import { App, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type LatestArrivalsPlugin from "./main";
import { detectPinyinSupport } from "./pinyin";
import { formatBytes, formatDateTime } from "./format";
import { SORT_KEY_LABELS, type SortKey } from "./types";

export class LatestArrivalsSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: LatestArrivalsPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("la-settings");

    containerEl.createEl("h2", { text: "最新入库 · 设置" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "本插件用一张「设备本地到货台账」记录每篇笔记首次出现在本机的时间。台账存在 Obsidian 的 localStorage 里，不进 vault、不会被 Syncthing 同步，因此 Mac 和手机各记各的，互不干扰。",
    });

    // ---------------- 列表 ----------------
    containerEl.createEl("h3", { text: "列表" });

    new Setting(containerEl)
      .setName("快速列表显示条数")
      .setDesc("命令/丝带图标打开时展示的最新入库笔记数量（1–10）。")
      .addSlider((s) =>
        s
          .setLimits(1, 10, 1)
          .setValue(this.plugin.settings.quickCount)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.quickCount = v;
            await this.plugin.persistSettings();
          }),
      );

    new Setting(containerEl)
      .setName("默认排序键")
      .setDesc("侧栏完整列表的初始排序方式。")
      .addDropdown((d) => {
        for (const k of Object.keys(SORT_KEY_LABELS) as SortKey[]) {
          d.addOption(k, SORT_KEY_LABELS[k]);
        }
        d.setValue(this.plugin.settings.sortKey).onChange(async (v) => {
          this.plugin.settings.sortKey = v as SortKey;
          await this.plugin.persistSettings();
          this.plugin.redrawViews();
        });
      });

    new Setting(containerEl)
      .setName("默认降序")
      .setDesc("开启后列表默认从大到小 / 从新到旧排列。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.sortDesc).onChange(async (v) => {
          this.plugin.settings.sortDesc = v;
          await this.plugin.persistSettings();
          this.plugin.redrawViews();
        }),
      );

    new Setting(containerEl)
      .setName("拼音排序时显示首字母分组")
      .setDesc("按 A–Z 插入分组表头。仅当排序键为「拼音首字母」时生效。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.groupByLetter).onChange(async (v) => {
          this.plugin.settings.groupByLetter = v;
          await this.plugin.persistSettings();
          this.plugin.redrawViews();
        }),
      );

    new Setting(containerEl)
      .setName("点击后打开方式")
      .setDesc("「新标签页」更接近 Recently Added Files 的行为；手机上「当前标签页」更省屏幕。")
      .addDropdown((d) =>
        d
          .addOption("current", "当前标签页")
          .addOption("new-tab", "新标签页")
          .setValue(this.plugin.settings.openIn)
          .onChange(async (v) => {
            this.plugin.settings.openIn = v === "new-tab" ? "new-tab" : "current";
            await this.plugin.persistSettings();
          }),
      );

    // ---------------- 入口 ----------------
    containerEl.createEl("h3", { text: "入口" });

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "移动端有两个可以「直接点」的位置：右下角 ☰ 弹出的功能区菜单，以及侧边栏顶部的标签页。侧边栏标签页打开一次后会被 Obsidian 记住，最省事。",
    });

    new Setting(containerEl)
      .setName("侧边栏标签页")
      .setDesc("把「最新入库」挂成侧边栏的一个标签页，打开一次后常驻，点图标即可切换。（需要 Obsidian 1.7.2 或更高版本）")
      .addDropdown((d) =>
        d
          .addOption("right", "挂在右侧边栏（推荐）")
          .addOption("left", "挂在左侧边栏")
          .addOption("off", "不挂载")
          .setValue(this.plugin.settings.sidebarSide)
          .onChange(async (v) => {
            const side = v as "off" | "left" | "right";
            this.plugin.settings.sidebarSide = side;
            await this.plugin.persistSettings();
            if (side === "off") {
              this.plugin.closeSidebarTab();
            } else {
              await this.plugin.ensureSidebarTab({ reveal: true });
            }
          }),
      );

    const mobileHint = containerEl.createDiv({ cls: "la-mobile-hint" });
    const hintTitle = mobileHint.createDiv({ cls: "la-mobile-hint-title" });
    setIcon(hintTitle.createSpan({ cls: "la-mobile-hint-icon" }), "smartphone");
    hintTitle.createSpan({ text: "怎么把它加到手机右下角的 ☰ 菜单（功能区）里" });
    const steps = mobileHint.createEl("ol", { cls: "la-mobile-hint-steps" });
    for (const s of [
      "打开 设置 → 外观，向下滚动到「高级」。",
      "在「功能区设置」一行点「管理」。",
      "在列表里找到「最新入库」，点它左侧的绿色 ➕ 加入功能区菜单。",
      "之后点右下角 ☰ 就能直接看到它；也可以在「快速访问」里把短按 ☰ 直接设为打开「最新入库」。",
    ]) {
      steps.createEl("li", { text: s });
    }
    mobileHint.createDiv({
      cls: "la-mobile-hint-note",
      text: "说明：插件加的图标在移动端功能区区默认是隐藏的，必须手动添加一次 —— 这是 Obsidian 的设计，插件无法代劳。",
    });

    // ---------------- 扫描 ----------------
    containerEl.createEl("h3", { text: "扫描" });

    new Setting(containerEl)
      .setName("返回前台时自动重扫")
      .setDesc("Android 上 Syncthing 通常是在 Obsidian 退到后台时完成同步的，回到前台立刻重扫是抓到新文件的关键。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.rescanOnForeground).onChange(async (v) => {
          this.plugin.settings.rescanOnForeground = v;
          await this.plugin.persistSettings();
        }),
      );

    new Setting(containerEl)
      .setName("深度扫描文件系统")
      .setDesc("绕过 Obsidian 索引，直接遍历 vault 目录。用于抓出「Syncthing 刚写好、Obsidian 还没索引」的文件。关闭后只读 Obsidian 内存索引（更快）。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.deepScan).onChange(async (v) => {
          this.plugin.settings.deepScan = v;
          await this.plugin.persistSettings();
          this.display();
        }),
      );

    if (this.plugin.settings.deepScan) {
      new Setting(containerEl)
        .setName("深度扫描最小间隔")
        .setDesc("两次深度扫描之间的最短间隔（秒）。设为 0 表示每次刷新都深扫（762 篇规模的库约需 1–2 秒）。")
        .addSlider((s) =>
          s
            .setLimits(0, 900, 30)
            .setValue(this.plugin.settings.deepScanIntervalSec)
            .setDynamicTooltip()
            .onChange(async (v) => {
              this.plugin.settings.deepScanIntervalSec = v;
              await this.plugin.persistSettings();
            }),
        );
    }

    new Setting(containerEl)
      .setName("排除路径")
      .setDesc("每行一条，支持 * 通配符。例：Archive/* 或 Templates/*")
      .addTextArea((t) => {
        t.setValue(this.plugin.settings.excludePatterns).onChange(
          async (v) => {
            this.plugin.settings.excludePatterns = v;
            await this.plugin.persistSettings();
            void this.plugin.refresh(false);
          },
        );
        t.inputEl.rows = 4;
      });

    // ---------------- 操作 ----------------
    containerEl.createEl("h3", { text: "维护" });

    new Setting(containerEl)
      .setName("立即重新扫描")
      .setDesc("强制走一次深度扫描，并刷新所有视图。")
      .addButton((b) =>
        b.setButtonText("立即扫描").onClick(async () => {
          b.setDisabled(true);
          await this.plugin.refresh(true);
          b.setDisabled(false);
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName("重建到货台账")
      .setDesc("清空本机的入库时间记录，下一次扫描会用文件属性（ctime/mtime）重新回填。换机或数据异常时使用。")
      .addButton((b) =>
        b
          .setWarning()
          .setButtonText("重建台账")
          .onClick(async () => {
            this.plugin.rebuildLedger();
            await this.plugin.refresh(true);
            new Notice("已重建到货台账");
            this.display();
          }),
      );

    const ignored = this.plugin.settings.ignoredPaths;
    new Setting(containerEl)
      .setName(`已忽略的笔记（${ignored.length}）`)
      .setDesc("这些笔记不会出现在列表中。")
      .addButton((b) =>
        b
          .setButtonText("全部恢复")
          .setDisabled(ignored.length === 0)
          .onClick(async () => {
            this.plugin.settings.ignoredPaths = [];
            await this.plugin.persistSettings();
            await this.plugin.refresh(false);
            this.display();
          }),
      );

    this.renderDiagnostics(containerEl);
  }

  // ------------------------------------------------------------------
  // 诊断面板：真机上确认 ctime / 拼音 collator 的实际行为
  // ------------------------------------------------------------------
  private renderDiagnostics(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "诊断" });

    const pinyin = detectPinyinSupport();
    const summary = this.plugin.service.lastSummary;
    const ledgerSize = this.plugin.ledgerSize;

    const grid = containerEl.createDiv({ cls: "la-diag" });
    const row = (label: string, value: string, cls = "") => {
      grid.createDiv({ cls: "la-diag-label", text: label });
      grid.createDiv({ cls: `la-diag-value ${cls}`, text: value });
    };

    row(
      "拼音排序",
      pinyin.ok ? `✓ ${pinyin.detail}` : `✗ ${pinyin.detail}`,
      pinyin.ok ? "is-ok" : "is-warn",
    );
    row("台账条目数", String(ledgerSize));
    row(
      "上次刷新",
      summary
        ? `${formatDateTime(this.plugin.service.lastRefreshAt)} · 用时 ${summary.durationMs} ms`
        : "尚未刷新",
    );
    if (summary) {
      row(
        "上次扫描",
        `索引 ${summary.indexed} 篇` +
          (summary.didDeepScan
            ? ` · 深扫另发现 ${summary.unindexed} 篇未索引`
            : " · 未做深扫") +
          (summary.deepScanTruncated ? "（深扫触顶提前结束）" : ""),
      );
      row(
        "上次结果",
        `新到货 ${summary.newCount} 篇 · 重命名继承 ${summary.inheritedCount} 篇`,
      );
      if (summary.error) row("错误", summary.error, "is-warn");
    }
    row("平台", this.plugin.isMobile ? "移动端（Android/iOS）" : "桌面端");

    // 最近 10 篇的原始时间属性
    const items = this.plugin.service.sorted("arrival", true).slice(0, 10);
    if (items.length > 0) {
      containerEl.createEl("h4", { text: "最近 10 篇的时间属性（原始值）" });
      containerEl.createEl("p", {
        cls: "setting-item-description",
        text: "入库时间 = 台账冻结值（本机首次发现）。创建时间 = 文件属性 ctime（Android 上为 inode change time）。修改时间 = 文件属性 mtime（Syncthing 会保留源文件的 mtime，所以通常等于你在电脑上写作的时间）。",
      });
      const table = containerEl.createEl("table", { cls: "la-diag-table" });
      const head = table.createEl("thead").createEl("tr");
      for (const h of ["笔记", "入库时间", "创建 ctime", "修改 mtime", "大小", "路径"]) {
        head.createEl("th", { text: h });
      }
      const body = table.createEl("tbody");
      for (const it of items) {
        const tr = body.createEl("tr");
        tr.createEl("td", { text: it.name });
        tr.createEl("td", { text: formatDateTime(it.firstSeen) });
        tr.createEl("td", { text: formatDateTime(it.ctime) });
        tr.createEl("td", { text: formatDateTime(it.mtime) });
        tr.createEl("td", { text: formatBytes(it.size) });
        const p = tr.createEl("td");
        p.setText(it.path);
        p.addClass("la-diag-path");
      }
    }

    // 台账原始记录
    const sample = this.plugin.sampleLedger(8);
    if (sample.length > 0) {
      const details = containerEl.createEl("details", { cls: "la-diag-details" });
      details.createEl("summary", { text: "台账原始记录（最近 8 条）" });
      const pre = details.createEl("pre", { cls: "la-diag-pre" });
      pre.setText(
        sample
          .map(
            (s) =>
              `${formatDateTime(s.entry.first)}  ${s.entry.size}B  ${s.path}`,
          )
          .join("\n"),
      );
    }

    const hint = containerEl.createDiv({ cls: "la-diag-hint" });
    setIcon(hint.createSpan({ cls: "la-diag-hint-icon" }), "info");
    hint.createSpan({
      text: "如果要反馈问题，把上面这段「最近 10 篇的时间属性」一起发出来即可。",
    });
  }
}
