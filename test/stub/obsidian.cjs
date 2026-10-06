/**
 * Obsidian API 的最小打桩实现，仅供 test/smoke.cjs 使用。
 *
 * 目的不是模拟 Obsidian，而是让 `main.js` 能被真实地 require 进来并跑完
 * `onload()`，从而在不上真机的前提下抓到「命令/视图/丝带没注册」
 * 「调用了不存在的 API」「台账没落到设备本地存储」这类运行期问题。
 */
const notices = [];
const detachedLeaves = [];

function stubIcon() {
  return { setIcon() {} };
}

function stubEl() {
  const el = {
    children: [],
    classList: { add() {}, remove() {} },
    style: {},
    textContent: "",
    value: "",
    rows: 0,
    empty() {},
    addClass() {},
    removeClass() {},
    setText(t) {
      this.textContent = t;
    },
    createDiv() {
      const c = stubEl();
      el.children.push(c);
      return c;
    },
    createEl() {
      const c = stubEl();
      el.children.push(c);
      return c;
    },
    createSpan() {
      const c = stubEl();
      el.children.push(c);
      return c;
    },
    addEventListener() {},
    setAttr() {},
    toggleClass() {},
    appendChild(c) {
      el.children.push(c);
      return c;
    },
    setCssProps() {},
    setCssStyles() {},
  };
  return el;
}

class Component {
  registerEvent() {}
  registerDomEvent() {}
  registerInterval() {}
  register() {}
  addChild(c) {
    return c;
  }
  removeChild(c) {
    return c;
  }
  load() {}
  unload() {}
}

class Events {
  on() {
    return {};
  }
  off() {}
}

class Plugin extends Component {
  constructor(app, manifest) {
    super();
    this.app = app;
    this.manifest = manifest;
    this.commands = [];
    this.views = {};
    this.ribbons = [];
  }
  addRibbonIcon(icon, title, cb) {
    const r = { icon, title, cb };
    this.ribbons.push(r);
    return r;
  }
  addCommand(cmd) {
    this.commands.push(cmd);
    return cmd;
  }
  addSettingTab(t) {
    this.settingTab = t;
  }
  registerView(type, factory) {
    this.views[type] = factory;
  }
  async loadData() {
    return null;
  }
  async saveData() {}
}

class ItemView extends Component {
  constructor(leaf) {
    super();
    this.leaf = leaf;
    this.contentEl = stubEl();
  }
}

class Modal extends Component {
  constructor(app) {
    super();
    this.app = app;
    this.contentEl = stubEl();
    this.modalEl = stubEl();
  }
  open() {
    this.onOpen();
  }
  close() {
    this.onClose();
  }
}

class PluginSettingTab extends Component {
  constructor(app, plugin) {
    super();
    this.app = app;
    this.plugin = plugin;
    this.containerEl = stubEl();
  }
}

class Setting {
  setName() {
    return this;
  }
  setDesc() {
    return this;
  }
  addSlider() {
    return this;
  }
  addToggle() {
    return this;
  }
  addDropdown() {
    return this;
  }
  addTextArea() {
    return this;
  }
  addButton() {
    return this;
  }
}

class Notice {
  constructor(msg) {
    notices.push(String(msg));
  }
}

class Menu {
  addItem() {
    return this;
  }
  addSeparator() {
    return this;
  }
  showAtMouseEvent() {}
}

class TAbstractFile {}
class TFile extends TAbstractFile {}
class TFolder extends TAbstractFile {}

class WorkspaceLeaf {
  constructor(type = "") {
    this.viewType = type;
    this.detached = false;
    this.view = { render() {} };
  }
  async setViewState(state) {
    this.viewType = state.type;
    if (state.active) appRef.workspace.activeLeaf = this;
  }
  async openFile() {}
  /** 归属的根：用于让插件判断标签页当前在哪一侧 */
  getRoot() {
    if (this.side === "right") return appRef.workspace.rightSplit;
    if (this.side === "left") return appRef.workspace.leftSplit;
    return appRef.workspace.rootSplit;
  }
  detach() {
    this.detached = true;
    detachedLeaves.push(this);
  }
}

let appRef = null;
function setApp(a) {
  appRef = a;
}

function setIcon() {}
function normalizePath(p) {
  return String(p)
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/");
}
const moment = (ts) => ({
  format: () => new Date(ts).toISOString(),
  fromNow: () => "刚刚",
  locale: () => moment(ts),
});
const Platform = { isMobile: true, isDesktopApp: false, isMobileApp: true };

module.exports = {
  Component,
  Events,
  Plugin,
  ItemView,
  Modal,
  PluginSettingTab,
  Setting,
  Notice,
  Menu,
  TAbstractFile,
  TFile,
  TFolder,
  WorkspaceLeaf,
  setIcon,
  normalizePath,
  moment,
  Platform,
  notices,
  detachedLeaves,
  setApp,
  stubEl,
  stubIcon,
};
