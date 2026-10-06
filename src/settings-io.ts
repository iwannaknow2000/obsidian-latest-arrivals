import { App, FuzzySuggestModal, Notice, TFile } from "obsidian";
import { t } from "./i18n";
import { DEFAULT_SETTINGS, type LatestArrivalsSettings } from "./types";

/**
 * 配置导出的文件名（放在 vault 根目录）。
 *
 * 特意存进 vault 而不是 App 本地存储：这样它会随 Syncthing 同步到手机，
 * 在电脑上导出的配置可以直接在手机上导入，反之亦然。
 */
export const EXPORT_FILE = "latest-arrivals-settings.json";

interface ExportPayload {
  plugin: string;
  version: string;
  exportedAt: string;
  settings: LatestArrivalsSettings;
}

export function serializeSettings(
  settings: LatestArrivalsSettings,
  version: string,
): string {
  const payload: ExportPayload = {
    plugin: "latest-arrivals",
    version,
    exportedAt: new Date().toISOString(),
    settings,
  };
  return JSON.stringify(payload, null, 2) + "\n";
}

/**
 * 解析配置文件。
 *
 * 刻意写得宽容：既接受我们自己的包装格式，也接受「直接就是一个设置对象」
 * 的裸格式 —— 用户手改过、或用旧版本导出的文件都能导入。
 */
export function parseSettingsFile(
  text: string,
): Partial<LatestArrivalsSettings> | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const obj = data as Record<string, unknown>;
  const candidate =
    obj.settings && typeof obj.settings === "object" && !Array.isArray(obj.settings)
      ? (obj.settings as Record<string, unknown>)
      : obj;

  // 只挑我们认识的键，避免把任意 JSON 灌进设置里
  const known = Object.keys(DEFAULT_SETTINGS) as Array<keyof LatestArrivalsSettings>;
  const picked: Record<string, unknown> = {};
  for (const key of known) {
    if (key in candidate) picked[key] = candidate[key];
  }
  return Object.keys(picked).length > 0 ? picked : null;
}

/** 把配置写进 vault 根目录；返回实际路径 */
export async function exportSettingsToVault(
  app: App,
  settings: LatestArrivalsSettings,
  version: string,
): Promise<string> {
  const json = serializeSettings(settings, version);
  const existing = app.vault.getAbstractFileByPath(EXPORT_FILE);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, json);
  } else {
    await app.vault.create(EXPORT_FILE, json);
  }
  return EXPORT_FILE;
}

/** 读取 vault 里任意一个文件的内容 */
export async function readVaultFile(app: App, file: TFile): Promise<string> {
  return app.vault.cachedRead(file);
}

/**
 * 挑选要导入的配置文件。
 *
 * 用 FuzzySuggestModal 列出 vault 里的 .json 文件 —— 手机上没有系统文件选择器可用，
 * 而配置文件本来就放在 vault 里，这样两个平台都是同一套交互。
 */
export class SettingsImportModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private readonly onPick: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder(t("settings.import.placeholder"));
  }

  getItems(): TFile[] {
    const configDir = this.app.vault.configDir;
    return this.app.vault
      .getFiles()
      .filter(
        (f) =>
          f.extension === "json" &&
          !f.path.startsWith(`${configDir}/`) &&
          !f.path.startsWith("."),
      )
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onPick(file);
  }
}

/** 供设置页调用：导出 + 提示 */
export async function exportWithNotice(
  app: App,
  settings: LatestArrivalsSettings,
  version: string,
): Promise<void> {
  try {
    const path = await exportSettingsToVault(app, settings, version);
    new Notice(t("notice.settingsExported", { path }), 6000);
  } catch (err) {
    new Notice(
      t("notice.settingsExportFailed", {
        reason: err instanceof Error ? err.message : String(err),
      }),
      8000,
    );
  }
}
