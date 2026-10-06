import { setIcon } from "obsidian";
import { formatBytes, formatDateTime, formatRelative, isFresh } from "../format";
import { t } from "../i18n";
import type { ArrivalItem } from "../types";

export interface RowHandlers {
  onOpen: (item: ArrivalItem, ev: MouseEvent) => void;
  onMenu: (item: ArrivalItem, ev: MouseEvent) => void;
}

const LONG_PRESS_MS = 500;

function folderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i > 0 ? path.slice(0, i) : "";
}

/**
 * 渲染一行笔记。
 *
 * 移动端要点：
 *  - 整行是最小 52px 高的触控目标，点击即打开；
 *  - Android WebView 的长按会派发 `contextmenu`，另外再兜一层定时器，
 *    保证「长按出菜单」在真机上一定可用。
 */
export function renderRow(
  container: HTMLElement,
  item: ArrivalItem,
  now: number,
  handlers: RowHandlers,
): HTMLElement {
  const row = container.createDiv({ cls: "la-row" });
  row.setAttr("data-path", item.path);

  const main = row.createDiv({ cls: "la-row-main" });

  const title = main.createDiv({ cls: "la-row-title" });
  title.setText(item.name || item.path.split("/").pop() || item.path);
  if (isFresh(item.firstSeen, now)) title.addClass("is-fresh");

  const meta = main.createDiv({ cls: "la-row-meta" });
  if (item.isNew) {
    meta.createSpan({ cls: "la-badge la-badge-new", text: t("row.badgeNew") });
  }
  if (item.unindexed) {
    const badge = meta.createSpan({
      cls: "la-badge la-badge-warn",
      text: t("row.badgeUnindexed"),
    });
    badge.setAttr("aria-label", t("row.badgeUnindexedTooltip"));
  }
  meta.createSpan({ cls: "la-meta-time", text: formatRelative(item.firstSeen) });
  meta.createSpan({ cls: "la-meta-dot", text: "·" });
  meta.createSpan({ cls: "la-meta-size", text: formatBytes(item.size) });

  const folder = folderOf(item.path);
  if (folder) {
    meta.createSpan({ cls: "la-meta-dot", text: "·" });
    meta.createSpan({ cls: "la-meta-folder", text: folder });
  }

  const side = row.createDiv({ cls: "la-row-side" });
  side.setAttr("title", t("row.arrivedAt", { time: formatDateTime(item.firstSeen) }));
  setIcon(side, "chevron-right");

  row.addEventListener("click", (ev) => {
    if (ev.defaultPrevented) return;
    handlers.onOpen(item, ev);
  });

  row.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    handlers.onMenu(item, ev);
  });

  let timer: number | null = null;
  const clear = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
  row.addEventListener(
    "touchstart",
    () => {
      clear();
      timer = window.setTimeout(() => {
        timer = null;
        handlers.onMenu(item, new MouseEvent("contextmenu"));
      }, LONG_PRESS_MS);
    },
    { passive: true },
  );
  row.addEventListener("touchend", clear, { passive: true });
  row.addEventListener("touchmove", clear, { passive: true });
  row.addEventListener("touchcancel", clear, { passive: true });

  return row;
}

/** 空态提示 */
export function renderEmpty(container: HTMLElement, text: string): void {
  const el = container.createDiv({ cls: "la-empty" });
  setIcon(el.createDiv({ cls: "la-empty-icon" }), "inbox");
  el.createDiv({ cls: "la-empty-text", text });
}
