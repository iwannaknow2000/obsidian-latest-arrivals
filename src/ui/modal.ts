import { App, Modal, Notice, setIcon } from "obsidian";
import type { ArrivalItem } from "../types";
import type { ArrivalsService } from "../service";
import { renderEmpty, renderRow } from "./row";
import { formatDateTime } from "../format";

export interface QuickModalHost {
  service: ArrivalsService;
  openItem: (item: ArrivalItem, opts?: { newTab?: boolean }) => Promise<void>;
  showItemMenu: (item: ArrivalItem, ev: MouseEvent) => void;
  openFullView: () => Promise<void>;
  getQuickCount: () => number;
}

/**
 * 「最新入库」快速弹层 —— 手机端主入口。
 *
 * 相比侧栏视图，弹层在 Android 上少两次点击（不用先拉开抽屉），
 * 一屏就能看完最近 N 篇并直接点开。
 */
export class LatestArrivalsModal extends Modal {
  constructor(
    app: App,
    private readonly host: QuickModalHost,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("la-modal");
    contentEl.empty();

    const n = Math.max(1, Math.min(10, this.host.getQuickCount()));
    const items = this.host.service.latest(n);
    const total = this.host.service.items.length;
    const now = Date.now();

    const header = contentEl.createDiv({ cls: "la-modal-header" });
    const titleWrap = header.createDiv({ cls: "la-modal-title-wrap" });
    titleWrap.createDiv({ cls: "la-modal-title", text: "最新入库" });
    titleWrap.createDiv({
      cls: "la-modal-subtitle",
      text: `最近 ${items.length} 篇 · 本库共 ${total} 篇笔记`,
    });

    const actions = header.createDiv({ cls: "la-modal-actions" });
    const fullBtn = actions.createEl("button", { cls: "la-icon-btn" });
    setIcon(fullBtn, "list");
    fullBtn.setAttr("aria-label", "打开完整列表（含排序）");
    fullBtn.addEventListener("click", () => {
      void this.host.openFullView();
      this.close();
    });

    const refreshBtn = actions.createEl("button", { cls: "la-icon-btn" });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.setAttr("aria-label", "重新扫描");
    refreshBtn.addEventListener("click", () => {
      void (async () => {
        refreshBtn.addClass("is-spinning");
        const s = await this.host.service.refresh({ deep: true });
        refreshBtn.removeClass("is-spinning");
        new Notice(
          s.newCount > 0
            ? `发现 ${s.newCount} 篇新入库笔记（${s.durationMs} ms）`
            : `没有新的入库笔记（扫描 ${s.indexed} 篇 · ${s.durationMs} ms）`,
        );
        this.onOpen();
      })();
    });

    const list = contentEl.createDiv({ cls: "la-list" });
    if (items.length === 0) {
      renderEmpty(
        list,
        "台账里还没有笔记。点右上角 ↻ 立即扫描一次；若日志很多，说明插件刚启用，正在建立基线。",
      );
      return;
    }

    for (const item of items) {
      renderRow(list, item, now, {
        onOpen: (it) => {
          void this.host.openItem(it);
          this.close();
        },
        onMenu: (it, ev) => this.host.showItemMenu(it, ev),
      });
    }

    const footer = contentEl.createDiv({ cls: "la-modal-footer" });
    footer.createSpan({
      cls: "la-footer-hint",
      text: "点击打开 · 长按出菜单 · 入库时间为「本机首次发现」时刻",
    });
    if (items[0]) {
      footer.createSpan({
        cls: "la-footer-stamp",
        text: `最近一篇 ${formatDateTime(items[0].firstSeen)}`,
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
