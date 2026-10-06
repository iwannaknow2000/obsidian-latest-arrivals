import { ItemView, setIcon, WorkspaceLeaf } from "obsidian";
import type { ArrivalsService } from "../service";
import { groupLetter } from "../pinyin";
import { renderEmpty, renderRow } from "./row";
import { t } from "../i18n";
import { SORT_KEYS, type ArrivalItem, type SortKey } from "../types";

export const LATEST_ARRIVALS_VIEW = "latest-arrivals-view";

export interface ViewHost {
  service: ArrivalsService;
  openItem: (item: ArrivalItem, opts?: { newTab?: boolean }) => Promise<void>;
  showItemMenu: (item: ArrivalItem, ev: MouseEvent) => void;
  getSort: () => { key: SortKey; desc: boolean; group: boolean };
  setSort: (patch: { key?: SortKey; desc?: boolean; group?: boolean }) => void;
  refresh: (deep: boolean) => Promise<void>;
}

/**
 * 侧栏完整列表：支持 5 种排序键 × 升降序、拼音分组表头、关键字过滤。
 * 桌面端和移动端都能用；移动端可从丝带图标或命令打开。
 */
export class LatestArrivalsView extends ItemView {
  private query = "";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: ViewHost,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return LATEST_ARRIVALS_VIEW;
  }

  getDisplayText(): string {
    return t("view.title");
  }

  getIcon(): string {
    return "history";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  /** 外部数据变化后调用，整块重绘 */
  render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("la-view");

    const { key, desc, group } = this.host.getSort();

    // ---------- 工具栏：排序键 + 方向 + 分组 + 重扫 ----------
    const bar = root.createDiv({ cls: "la-toolbar" });

    const select = bar.createEl("select", { cls: "dropdown la-sort-select" });
    for (const k of SORT_KEYS) {
      const opt = select.createEl("option", { text: t(`sort.${k}`) });
      opt.value = k;
      if (k === key) opt.selected = true;
    }
    select.addEventListener("change", () => {
      this.host.setSort({ key: select.value as SortKey });
      this.render();
    });

    const dirBtn = bar.createEl("button", { cls: "la-icon-btn" });
    setIcon(dirBtn, desc ? "arrow-down" : "arrow-up");
    dirBtn.setAttr("aria-label", desc ? t("view.sortDesc") : t("view.sortAsc"));
    dirBtn.addEventListener("click", () => {
      this.host.setSort({ desc: !desc });
      this.render();
    });

    if (key === "pinyin") {
      const groupBtn = bar.createEl("button", { cls: "la-icon-btn" });
      setIcon(groupBtn, "list-tree");
      groupBtn.toggleClass("is-active", group);
      groupBtn.setAttr("aria-label", group ? t("view.groupHide") : t("view.groupShow"));
      groupBtn.addEventListener("click", () => {
        this.host.setSort({ group: !group });
        this.render();
      });
    }

    const refreshBtn = bar.createEl("button", { cls: "la-icon-btn" });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.setAttr("aria-label", t("modal.rescan"));
    refreshBtn.addEventListener("click", () => {
      void (async () => {
        refreshBtn.addClass("is-spinning");
        await this.host.refresh(true);
        refreshBtn.removeClass("is-spinning");
        this.render();
      })();
    });

    const search = root.createEl("input", {
      cls: "la-search",
      attr: { type: "search", placeholder: t("view.filterPlaceholder") },
    });
    search.value = this.query;
    search.addEventListener("input", () => {
      this.query = search.value;
      this.renderList(listWrap);
    });

    const stat = root.createDiv({ cls: "la-count" });

    // ---------- 列表容器（必须在 search 之后创建，保持 DOM 顺序）----------
    const listWrap = root.createDiv({ cls: "la-list" });

    const items = this.filteredItems();
    stat.setText(
      this.query
        ? t("view.countFiltered", {
            shown: items.length,
            total: this.host.service.items.length,
          })
        : t("view.countAll", { total: items.length }),
    );
    this.renderList(listWrap, items);
  }

  private filteredItems(): ArrivalItem[] {
    const { key, desc } = this.host.getSort();
    const sorted = this.host.service.sorted(key, desc);
    const q = this.query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (i) => i.name.toLowerCase().includes(q) || i.path.toLowerCase().includes(q),
    );
  }

  private renderList(container: HTMLElement, precomputed?: ArrivalItem[]): void {
    container.empty();
    const items = precomputed ?? this.filteredItems();
    const { key, group } = this.host.getSort();
    const now = Date.now();

    if (items.length === 0) {
      renderEmpty(container, this.query ? t("view.emptyFiltered") : t("view.emptyLedger"));
      return;
    }

    const showGroups = key === "pinyin" && group;
    let lastLetter = "";
    for (const item of items) {
      if (showGroups) {
        const letter = groupLetter(item.name);
        if (letter !== lastLetter) {
          lastLetter = letter;
          container.createDiv({ cls: "la-group-header", text: letter });
        }
      }
      renderRow(container, item, now, {
        onOpen: (it) => void this.host.openItem(it),
        onMenu: (it, ev) => this.host.showItemMenu(it, ev),
      });
    }
  }
}
