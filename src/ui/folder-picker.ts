import { App, Modal, Notice, Setting, setIcon, TFolder } from "obsidian";
import { t } from "../i18n";

/**
 * 文件夹多选器。
 *
 * 手打 glob 太反人类，所以把「整个文件夹都不看」做成勾选：
 * 列出 vault 里所有文件夹（带子文件夹计数），勾上即排除该文件夹及其下全部内容。
 * 需要通配符的高级用法仍然走设置页里的「额外排除规则」文本框。
 */
export class FolderPickerModal extends Modal {
  private selected: Set<string>;
  private query = "";
  private listEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;

  constructor(
    app: App,
    current: readonly string[],
    private readonly onDone: (folders: string[]) => void,
  ) {
    super(app);
    this.selected = new Set(current);
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("la-folder-modal");
    contentEl.empty();

    contentEl.createDiv({ cls: "la-modal-title", text: t("folderPicker.title") });

    // 搜索框
    const search = contentEl.createEl("input", {
      cls: "la-search",
      attr: { type: "search", placeholder: t("folderPicker.search") },
    });
    search.addEventListener("input", () => {
      this.query = search.value;
      this.renderList();
    });

    // 全选 / 清空
    const bulk = contentEl.createDiv({ cls: "la-picker-bulk" });
    const mkBulk = (label: string, fn: () => void) => {
      const b = bulk.createEl("button", { cls: "la-picker-bulk-btn", text: label });
      b.addEventListener("click", fn);
    };
    mkBulk(t("folderPicker.selectAll"), () => {
      for (const f of this.visibleFolders()) this.selected.add(f);
      this.renderList();
    });
    mkBulk(t("folderPicker.clear"), () => {
      this.selected.clear();
      this.renderList();
    });

    this.countEl = contentEl.createDiv({ cls: "la-count" });
    this.listEl = contentEl.createDiv({ cls: "la-picker-list" });

    this.renderList();

    // 底部操作
    const footer = new Setting(contentEl);
    footer.settingEl.addClass("la-picker-footer");
    footer.addButton((b) =>
      b.setButtonText(t("folderPicker.cancel")).onClick(() => this.close()),
    );
    footer.addButton((b) =>
      b
        .setButtonText(t("folderPicker.confirm"))
        .setCta()
        .onClick(() => {
          this.onDone([...this.selected].sort());
          this.close();
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  /** vault 里所有值得展示的文件夹 */
  private allFolders(): string[] {
    const configDir = this.app.vault.configDir;
    return this.app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder)
      .map((f) => f.path)
      .filter((p) => p !== "/" && p !== "" && !p.startsWith(`${configDir}/`) && p !== configDir)
      .filter((p) => !p.split("/").some((seg) => seg.startsWith(".")))
      .sort((a, b) => a.localeCompare(b));
  }

  private visibleFolders(): string[] {
    const all = this.allFolders();
    const q = this.query.trim().toLowerCase();
    return q ? all.filter((f) => f.toLowerCase().includes(q)) : all;
  }

  private renderList(): void {
    const list = this.listEl;
    if (!list) return;
    list.empty();

    const folders = this.visibleFolders();
    const all = this.allFolders();

    this.countEl?.setText(
      t("folderPicker.count", { selected: this.selected.size, total: all.length }),
    );

    if (folders.length === 0) {
      list.createDiv({ cls: "la-empty-text", text: t("folderPicker.empty") });
      return;
    }

    for (const folder of folders) {
      const row = list.createDiv({ cls: "la-picker-row" });
      const checked = this.selected.has(folder);
      row.toggleClass("is-checked", checked);

      const box = row.createEl("input", { cls: "la-picker-check", attr: { type: "checkbox" } });
      box.checked = checked;
      box.addEventListener("change", () => {
        if (box.checked) this.selected.add(folder);
        else this.selected.delete(folder);
        row.toggleClass("is-checked", box.checked);
        this.countEl?.setText(
          t("folderPicker.count", { selected: this.selected.size, total: all.length }),
        );
      });

      const icon = row.createDiv({ cls: "la-picker-icon" });
      setIcon(icon, "folder");

      const text = row.createDiv({ cls: "la-picker-text" });
      const name = folder.split("/").pop() ?? folder;
      text.createDiv({ cls: "la-picker-name", text: name });
      // 只在有上级路径时显示完整路径，避免单层文件夹重复显示名字
      if (folder.includes("/")) {
        text.createDiv({ cls: "la-picker-path", text: folder });
      }

      // 整行可点，移动端更好按
      row.addEventListener("click", (ev) => {
        if (ev.target === box) return;
        box.checked = !box.checked;
        box.dispatchEvent(new Event("change"));
      });
    }
  }
}

/** 打开选择器并保存结果的小包装 */
export function pickFolders(
  app: App,
  current: readonly string[],
  onDone: (folders: string[]) => void,
): void {
  try {
    new FolderPickerModal(app, current, onDone).open();
  } catch (err) {
    new Notice(err instanceof Error ? err.message : String(err));
  }
}
