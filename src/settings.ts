import { App, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type LatestArrivalsPlugin from "./main";
import { detectPinyinSupport } from "./pinyin";
import { formatBytes, formatDateTime } from "./format";
import { LOCALES, t, type LanguageSetting } from "./i18n";
import { SORT_KEYS, type SortKey } from "./types";

/** 用 Setting#setHeading 代替手写 h2/h3，保证与 Obsidian 其他设置页样式一致 */
function heading(containerEl: HTMLElement, text: string): void {
  new Setting(containerEl).setName(text).setHeading();
}

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

    // ------------------------------------------------------------------
    // 通用设置放最上面，按官方 UI 规范不加标题
    // ------------------------------------------------------------------
    new Setting(containerEl)
      .setName(t("settings.language.name"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((d) => {
        d.addOption("auto", t("settings.language.auto"));
        for (const locale of LOCALES) d.addOption(locale.code, locale.label);
        d.setValue(this.plugin.settings.language).onChange(async (value) => {
          await this.plugin.setLanguage(value as LanguageSetting);
        });
      });

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: t("settings.intro"),
    });

    // ------------------------------------------------------------------
    // 列表
    // ------------------------------------------------------------------
    new Setting(containerEl).setName(t("settings.quickCount.name")).setDesc(t("settings.quickCount.desc")).addSlider((s) =>
      s
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.quickCount)
        .setDynamicTooltip()
        .onChange(async (v) => {
          this.plugin.settings.quickCount = v;
          await this.plugin.persistSettings();
        }),
    );

    new Setting(containerEl).setName(t("settings.sortKey.name")).setDesc(t("settings.sortKey.desc")).addDropdown((d) => {
      for (const key of SORT_KEYS) d.addOption(key, t(`sort.${key}`));
      d.setValue(this.plugin.settings.sortKey).onChange(async (v) => {
        this.plugin.settings.sortKey = v as SortKey;
        await this.plugin.persistSettings();
        this.plugin.redrawViews();
      });
    });

    new Setting(containerEl).setName(t("settings.sortDesc.name")).setDesc(t("settings.sortDesc.desc")).addToggle((toggle) =>
      toggle.setValue(this.plugin.settings.sortDesc).onChange(async (v) => {
        this.plugin.settings.sortDesc = v;
        await this.plugin.persistSettings();
        this.plugin.redrawViews();
      }),
    );

    new Setting(containerEl).setName(t("settings.group.name")).setDesc(t("settings.group.desc")).addToggle((toggle) =>
      toggle.setValue(this.plugin.settings.groupByLetter).onChange(async (v) => {
        this.plugin.settings.groupByLetter = v;
        await this.plugin.persistSettings();
        this.plugin.redrawViews();
      }),
    );

    new Setting(containerEl).setName(t("settings.openIn.name")).setDesc(t("settings.openIn.desc")).addDropdown((d) =>
      d
        .addOption("current", t("settings.openIn.current"))
        .addOption("new-tab", t("settings.openIn.newTab"))
        .setValue(this.plugin.settings.openIn)
        .onChange(async (v) => {
          this.plugin.settings.openIn = v === "new-tab" ? "new-tab" : "current";
          await this.plugin.persistSettings();
        }),
    );

    // ------------------------------------------------------------------
    // 入口
    // ------------------------------------------------------------------
    heading(containerEl, t("settings.sectionEntry"));

    new Setting(containerEl)
      .setName(t("settings.sidebar.name"))
      .setDesc(t("settings.sidebar.desc"))
      .addDropdown((d) =>
        d
          .addOption("right", t("settings.sidebar.right"))
          .addOption("left", t("settings.sidebar.left"))
          .addOption("off", t("settings.sidebar.off"))
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

    this.renderMobileHint(containerEl);

    // ------------------------------------------------------------------
    // 扫描
    // ------------------------------------------------------------------
    heading(containerEl, t("settings.sectionScan"));

    new Setting(containerEl)
      .setName(t("settings.rescanForeground.name"))
      .setDesc(t("settings.rescanForeground.desc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.rescanOnForeground).onChange(async (v) => {
          this.plugin.settings.rescanOnForeground = v;
          await this.plugin.persistSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.deepScan.name"))
      .setDesc(t("settings.deepScan.desc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.deepScan).onChange(async (v) => {
          this.plugin.settings.deepScan = v;
          await this.plugin.persistSettings();
          this.display();
        }),
      );

    if (this.plugin.settings.deepScan) {
      new Setting(containerEl)
        .setName(t("settings.deepScanInterval.name"))
        .setDesc(t("settings.deepScanInterval.desc"))
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
      .setName(t("settings.exclude.name"))
      .setDesc(t("settings.exclude.desc"))
      .addTextArea((area) => {
        area.setValue(this.plugin.settings.excludePatterns).onChange(async (v) => {
          this.plugin.settings.excludePatterns = v;
          await this.plugin.persistSettings();
          void this.plugin.refresh(false);
        });
        area.inputEl.rows = 4;
      });

    // ------------------------------------------------------------------
    // 维护
    // ------------------------------------------------------------------
    heading(containerEl, t("settings.sectionMaintenance"));

    new Setting(containerEl)
      .setName(t("settings.rescanNow.name"))
      .setDesc(t("settings.rescanNow.desc"))
      .addButton((b) =>
        b.setButtonText(t("settings.rescanNow.button")).onClick(async () => {
          b.setDisabled(true);
          await this.plugin.refresh(true);
          b.setDisabled(false);
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.rebuild.name"))
      .setDesc(t("settings.rebuild.desc"))
      .addButton((b) =>
        b
          .setWarning()
          .setButtonText(t("settings.rebuild.button"))
          .onClick(async () => {
            this.plugin.rebuildLedger();
            await this.plugin.refresh(true);
            new Notice(t("notice.ledgerRebuilt"));
            this.display();
          }),
      );

    const ignored = this.plugin.settings.ignoredPaths;
    new Setting(containerEl)
      .setName(t("settings.ignored.name", { count: ignored.length }))
      .setDesc(t("settings.ignored.desc"))
      .addButton((b) =>
        b
          .setButtonText(t("settings.ignored.restore"))
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
  // 移动端入口引导
  // ------------------------------------------------------------------
  private renderMobileHint(containerEl: HTMLElement): void {
    const box = containerEl.createDiv({ cls: "la-mobile-hint" });
    const title = box.createDiv({ cls: "la-mobile-hint-title" });
    setIcon(title.createSpan({ cls: "la-mobile-hint-icon" }), "smartphone");
    title.createSpan({ text: t("settings.mobile.title") });

    const steps = box.createEl("ol", { cls: "la-mobile-hint-steps" });
    for (const step of ["step1", "step2", "step3", "step4"]) {
      steps.createEl("li", { text: t(`settings.mobile.${step}`) });
    }
    box.createDiv({ cls: "la-mobile-hint-note", text: t("settings.mobile.note") });
  }

  // ------------------------------------------------------------------
  // 诊断面板
  // ------------------------------------------------------------------
  private renderDiagnostics(containerEl: HTMLElement): void {
    heading(containerEl, t("settings.sectionDiagnostics"));

    const pinyin = detectPinyinSupport();
    const summary = this.plugin.service.lastSummary;
    const grid = containerEl.createDiv({ cls: "la-diag" });

    const row = (label: string, value: string, cls = "") => {
      grid.createDiv({ cls: "la-diag-label", text: label });
      grid.createDiv({ cls: `la-diag-value ${cls}`, text: value });
    };

    row(
      t("settings.diag.pinyinLabel"),
      pinyin.ok
        ? t("settings.diag.pinyinOk", { locale: pinyin.locale })
        : t("settings.diag.pinyinFallback"),
      pinyin.ok ? "is-ok" : "is-warn",
    );
    row(t("settings.diag.ledger"), String(this.plugin.ledgerSize));
    row(
      t("settings.diag.lastRefresh"),
      summary
        ? t("settings.diag.elapsed", {
            time: formatDateTime(this.plugin.service.lastRefreshAt),
            ms: summary.durationMs,
          })
        : t("settings.diag.never"),
    );
    if (summary) {
      row(
        t("settings.diag.lastScan"),
        t("settings.diag.indexed", { count: summary.indexed }) +
          " · " +
          (summary.didDeepScan
            ? t("settings.diag.deepExtra", { count: summary.unindexed })
            : t("settings.diag.noDeepScan")) +
          (summary.deepScanTruncated ? t("settings.diag.truncated") : ""),
      );
      row(
        t("settings.diag.lastResult"),
        t("settings.diag.newAndInherited", {
          created: summary.newCount,
          inherited: summary.inheritedCount,
        }),
      );
      if (summary.error) row(t("settings.diag.error"), summary.error, "is-warn");
    }
    row(
      t("settings.diag.platform"),
      this.plugin.isMobile
        ? t("settings.diag.platformMobile")
        : t("settings.diag.platformDesktop"),
    );

    this.renderDiagnosticsTable(containerEl);
    this.renderRawLedger(containerEl);

    const hint = containerEl.createDiv({ cls: "la-diag-hint" });
    setIcon(hint.createSpan({ cls: "la-diag-hint-icon" }), "info");
    hint.createSpan({ text: t("settings.diag.feedback") });
  }

  private renderDiagnosticsTable(containerEl: HTMLElement): void {
    const items = this.plugin.service.sorted("arrival", true).slice(0, 10);
    if (items.length === 0) return;

    heading(containerEl, t("settings.diag.tableTitle"));
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: t("settings.diag.tableDesc"),
    });

    const table = containerEl.createEl("table", { cls: "la-diag-table" });
    const head = table.createEl("thead").createEl("tr");
    for (const key of ["colNote", "colArrival", "colCtime", "colMtime", "colSize", "colPath"]) {
      head.createEl("th", { text: t(`settings.diag.${key}`) });
    }
    const body = table.createEl("tbody");
    for (const it of items) {
      const tr = body.createEl("tr");
      tr.createEl("td", { text: it.name });
      tr.createEl("td", { text: formatDateTime(it.firstSeen) });
      tr.createEl("td", { text: formatDateTime(it.ctime) });
      tr.createEl("td", { text: formatDateTime(it.mtime) });
      tr.createEl("td", { text: formatBytes(it.size) });
      const pathCell = tr.createEl("td");
      pathCell.setText(it.path);
      pathCell.addClass("la-diag-path");
    }
  }

  private renderRawLedger(containerEl: HTMLElement): void {
    const sample = this.plugin.sampleLedger(8);
    if (sample.length === 0) return;

    const details = containerEl.createEl("details", { cls: "la-diag-details" });
    details.createEl("summary", { text: t("settings.diag.rawTitle") });
    const pre = details.createEl("pre", { cls: "la-diag-pre" });
    pre.setText(
      sample
        .map((s) => `${formatDateTime(s.entry.first)}  ${s.entry.size}B  ${s.path}`)
        .join("\n"),
    );
  }
}
