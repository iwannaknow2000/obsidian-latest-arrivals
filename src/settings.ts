import { App, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type LatestArrivalsPlugin from "./main";
import { detectPinyinSupport } from "./pinyin";
import { formatDateTime } from "./format";
import { LOCALES, t, type LanguageSetting } from "./i18n";
import { SORT_KEYS, type SortKey } from "./types";
import { pickFolders } from "./ui/folder-picker";

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
            // 走 applySidebarSide 而不是 ensureSidebarTab：
            // 后者发现已有标签页就会直接返回，导致从「右侧」改成「左侧」时不会搬家
            await this.plugin.applySidebarSide({ reveal: true });
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

    // 排除文件夹：勾选式，主力用法
    const folders = this.plugin.settings.excludedFolders;
    new Setting(containerEl)
      .setName(t("settings.folders.name"))
      .setDesc(t("settings.folders.desc"))
      .addButton((b) =>
        b.setButtonText(t("settings.folders.button")).onClick(() => {
          pickFolders(this.app, this.plugin.settings.excludedFolders, (picked) => {
            void (async () => {
              this.plugin.settings.excludedFolders = picked;
              await this.plugin.persistSettings();
              await this.plugin.refresh(false);
              this.display();
            })();
          });
        }),
      );

    containerEl.createDiv({
      cls: "la-folders-summary" + (folders.length === 0 ? " is-empty" : ""),
      text:
        folders.length === 0
          ? t("settings.folders.none")
          : t("settings.folders.summary", {
              count: folders.length,
              list: folders.join("、"),
            }),
    });

    // 额外排除规则：留给需要通配符的高级用法
    new Setting(containerEl)
      .setName(t("settings.patterns.name"))
      .setDesc(t("settings.patterns.desc"))
      .addTextArea((area) => {
        area.setValue(this.plugin.settings.excludePatterns).onChange(async (v) => {
          this.plugin.settings.excludePatterns = v;
          await this.plugin.persistSettings();
          void this.plugin.refresh(false);
        });
        area.inputEl.rows = 3;
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

    // ------------------------------------------------------------------
    // 配置备份
    // ------------------------------------------------------------------
    heading(containerEl, t("settings.sectionBackup"));

    new Setting(containerEl)
      .setName(t("settings.export.name"))
      .setDesc(t("settings.export.desc"))
      .addButton((b) =>
        b.setButtonText(t("settings.export.button")).onClick(() => {
          void this.plugin.exportSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.import.name"))
      .setDesc(t("settings.import.desc"))
      .addButton((b) =>
        b.setButtonText(t("settings.import.button")).onClick(() => {
          this.plugin.openImportPicker(() => this.display());
        }),
      );

    this.renderDiagnostics(containerEl);
  }

  // ------------------------------------------------------------------
  // 移动端入口引导
  // ------------------------------------------------------------------
  private renderMobileHint(containerEl: HTMLElement): void {
    // 折进可折叠块：需要时展开，不必让设置页一进来就是一大段说明
    const box = containerEl.createEl("details", { cls: "la-mobile-hint" });
    const title = box.createEl("summary", { cls: "la-mobile-hint-title" });
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

  }

}
