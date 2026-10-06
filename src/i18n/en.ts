/**
 * English strings — the default bundle.
 *
 * Keep this file alphabetically grouped by area, and keep every other bundle
 * exactly in sync with the key set here. Any key missing from a translation
 * silently falls back to the English value.
 */
export const en: Record<string, string> = {
  // ---- plugin ----
  "plugin.name": "Latest Arrivals",
  "ribbon.title": "Latest arrivals",
  "view.title": "Latest arrivals",

  // ---- commands ----
  "command.openQuickList": "Open latest arrivals",
  "command.openFullView": "Open full list in sidebar",
  "command.toggleSidebarTab": "Show or hide the \"Latest arrivals\" sidebar tab",
  "command.openLatestInTabs": "Open latest arrivals in new tabs",
  "command.rescan": "Rescan now",
  "command.ignoreCurrent": "Ignore current note",
  "command.rebuildLedger": "Rebuild arrival ledger",

  // ---- context menus ----
  "menu.open": "Open",
  "menu.openInNewTab": "Open in new tab",
  "menu.copyLink": "Copy note link",
  "menu.copyPath": "Copy file path",
  "menu.ignore": "Ignore from latest arrivals",
  "menu.openList": "Open \"Latest arrivals\" list",

  // ---- notices ----
  "notice.newArrivals": "Latest arrivals: {count} new note(s)",
  "notice.foundNew": "Found {count} new note(s)",
  "notice.noneNew": "No new notes (scanned {count} notes in {ms} ms)",
  "notice.noNotes": "The arrival ledger is empty",
  "notice.openedCount": "Opened {count} note(s)",
  "notice.ledgerRebuilt": "Arrival ledger rebuilt",
  "notice.ignored": "Ignored \"{name}\"",
  "notice.notIndexed": "\"{name}\" hasn't been indexed by Obsidian yet. Its arrival time is recorded - restart Obsidian to open it.",
  "notice.fileNotFound": "File not found: {path}",
  "notice.copiedLink": "Copied [[note link]]",
  "notice.copiedPath": "Copied file path",
  "notice.copyFailed": "Copy failed: {text}",
  "notice.sidebarTabRemoved": "Removed the \"Latest arrivals\" sidebar tab",
  "notice.sidebarUnsupported": "This Obsidian version can't add the sidebar tab automatically. Run \"Open full list in sidebar\" once and it will stay there.",
  "notice.languageChanged": "Language changed. Reloading the plugin so command names update too.",
  "notice.settingsRestored": "Plugin settings were missing and have been restored from this device's local backup.",
  "notice.reloadFailed": "Couldn't reload the plugin automatically. Toggle it off and on in Settings → Community plugins.",

  // ---- sort keys ----
  "sort.arrival": "Arrival time (first seen here)",
  "sort.pinyin": "File name (pinyin initials)",
  "sort.ctime": "Created time (ctime)",
  "sort.mtime": "Modified time (mtime)",
  "sort.size": "Note size",

  // ---- quick list modal ----
  "modal.subtitle": "{shown} most recent · {total} notes in this vault",
  "modal.openFullList": "Open full list (with sorting)",
  "modal.rescan": "Rescan now",
  "modal.empty": "The ledger is empty. Tap the refresh button to scan; on first run the plugin backfills arrival times from file attributes.",
  "modal.footerHint": "Tap to open · long-press for the menu · arrival time is when this device first saw the note",
  "modal.footerStamp": "Most recent: {time}",
  "modal.scannedNew": "Found {count} new note(s) ({ms} ms)",
  "modal.scannedNone": "No new notes (scanned {count} · {ms} ms)",

  // ---- sidebar view ----
  "view.filterPlaceholder": "Filter by title or path…",
  "view.countFiltered": "{shown} of {total} notes",
  "view.countAll": "{total} notes",
  "view.emptyFiltered": "No notes match your filter.",
  "view.emptyLedger": "The ledger is empty. Tap the refresh button to scan; on first run the plugin backfills arrival times from file attributes.",
  "view.sortAsc": "Ascending (click for descending)",
  "view.sortDesc": "Descending (click for ascending)",
  "view.groupShow": "Show A–Z group headers",
  "view.groupHide": "Hide A–Z group headers",

  // ---- list rows ----
  "row.badgeNew": "New",
  "row.badgeUnindexed": "Pending",
  "row.badgeUnindexedTooltip": "Obsidian hasn't indexed this note yet; restart Obsidian to open it",
  "row.arrivedAt": "Arrived {time}",

  // ---- settings: sections ----
  "settings.sectionEntry": "Entry points",
  "settings.sectionScan": "Scanning",
  "settings.sectionMaintenance": "Maintenance",
  "settings.sectionDiagnostics": "Diagnostics",

  // ---- settings: general ----
  "settings.intro": "Arrival times are kept per device, outside your vault, so they are never synced.",
  "settings.language.name": "Interface language",
  "settings.language.desc": "Follows Obsidian by default. Changing this reloads the plugin.",
  "settings.language.auto": "Auto (follow Obsidian)",
  "settings.language.reloadFailed": "Couldn't reload the plugin automatically. Toggle it off and on in Settings → Community plugins.",

  "settings.quickCount.name": "Notes in the quick list",
  "settings.quickCount.desc": "How many of the most recent arrivals to show (1–10).",
  "settings.sortKey.name": "Default sort key",
  "settings.sortKey.desc": "Initial sorting for the full sidebar list.",
  "settings.sortDesc.name": "Sort descending by default",
  "settings.sortDesc.desc": "Newest or largest first.",
  "settings.group.name": "Show pinyin initial group headers",
  "settings.group.desc": "Only applies when sorting by pinyin initials.",
  "settings.openIn.name": "Open notes in",
  "settings.openIn.desc": "\"New tab\" matches the behaviour of Recently Added Files; \"Current tab\" saves screen space on mobile.",
  "settings.openIn.current": "Current tab",
  "settings.openIn.newTab": "New tab",
  "settings.sidebar.name": "Sidebar tab",
  "settings.sidebar.desc": "Adds a sidebar tab, remembered by Obsidian after you open it once.",
  "settings.sidebar.right": "Right sidebar (recommended)",
  "settings.sidebar.left": "Left sidebar",
  "settings.sidebar.off": "Don't add",

  // ---- settings: mobile hint ----
  "settings.mobile.title": "How to add it to the ☰ menu (ribbon) on mobile",
  "settings.mobile.step1": "Open Settings → Appearance and scroll down to \"Advanced\".",
  "settings.mobile.step2": "Under \"Ribbon menu\", choose \"Manage\".",
  "settings.mobile.step3": "Find \"Latest arrivals\" and click the green ➕ next to it.",
  "settings.mobile.step4": "The ☰ button at the bottom right will now show it. You can also set the ☰ short-press action to open it directly.",
  "settings.mobile.note": "Plugin icons start out hidden in Obsidian's mobile ribbon menu and must be added by hand once.",

  // ---- settings: scanning ----
  "settings.rescanForeground.name": "Rescan when returning to the foreground",
  "settings.rescanForeground.desc": "Rescans the moment you return to the app.",
  "settings.deepScan.name": "Deep-scan the file system",
  "settings.deepScan.desc": "Walks the vault folder directly to catch notes Obsidian has not indexed yet. Slower, but needed for freshly synced files.",
  "settings.deepScanInterval.name": "Minimum interval between deep scans",
  "settings.deepScanInterval.desc": "Seconds between deep scans. 0 scans on every refresh.",
  "settings.exclude.name": "Excluded paths",
  "settings.exclude.desc": "One per line, * works as a wildcard.",

  "settings.folders.name": "Excluded folders",
  "settings.folders.desc": "Tick whole folders to leave them out of every list. Pick them from a list instead of typing patterns.",
  "settings.folders.button": "Choose folders…",
  "settings.folders.none": "None selected",
  "settings.folders.summary": "{count} excluded: {list}",
  "settings.patterns.name": "Additional exclusion rules",
  "settings.patterns.desc": "One per line. * and ? are wildcards, matched against the full vault path.",
  "folderPicker.title": "Choose folders to exclude",
  "folderPicker.search": "Filter folders…",
  "folderPicker.selectAll": "Select all shown",
  "folderPicker.clear": "Clear all",
  "folderPicker.count": "{selected} selected · {total} folders",
  "folderPicker.empty": "No folders match your filter.",
  "folderPicker.confirm": "Done",
  "folderPicker.cancel": "Cancel",

  // ---- settings: maintenance ----
  "settings.rescanNow.name": "Rescan now",
  "settings.rescanNow.desc": "Forces a deep scan and refreshes every view.",
  "settings.rescanNow.button": "Rescan",
  "settings.rebuild.name": "Rebuild arrival ledger",
  "settings.rebuild.desc": "Clears this device's arrival times. The next scan backfills them from file attributes (ctime and mtime). Useful after switching devices or if the data looks wrong.",
  "settings.rebuild.button": "Rebuild",
  "settings.ignored.name": "Ignored notes ({count})",
  "settings.ignored.desc": "These notes are hidden from every list.",
  "settings.ignored.restore": "Restore all",

  "settings.sectionBackup": "Configuration backup",
  "settings.export.name": "Export configuration",
  "settings.export.desc": "Writes your settings to latest-arrivals-settings.json in the vault root. Because it lives in the vault, it syncs to your other devices, so you can export on one and import on another.",
  "settings.export.button": "Export",
  "settings.import.name": "Import configuration",
  "settings.import.desc": "Pick a previously exported JSON file from your vault and apply it. The file is validated first; unrecognised keys are ignored.",
  "settings.import.button": "Import",
  "settings.import.placeholder": "Choose a configuration file…",
  "notice.settingsExported": "Configuration exported to {path}",
  "notice.settingsExportFailed": "Export failed: {reason}",
  "notice.settingsImported": "Configuration imported.",
  "notice.settingsImportFailed": "Import failed: could not read {path}",
  "notice.settingsImportInvalid": "{path} is not a valid Latest Arrivals configuration file.",

  // ---- settings: diagnostics ----
  "settings.diag.pinyinLabel": "Pinyin sorting",
  "settings.diag.pinyinOk": "Working - built-in ICU Chinese collation is available ({locale})",
  "settings.diag.pinyinFallback": "Unavailable - this WebView has no Chinese collation data, so Chinese file names fall back to code-point order",
  "settings.diag.ledger": "Ledger entries",
  "settings.diag.lastRefresh": "Last refresh",
  "settings.diag.never": "Not yet",
  "settings.diag.elapsed": "{time} · {ms} ms",
  "settings.diag.lastScan": "Last scan",
  "settings.diag.indexed": "{count} notes from the index",
  "settings.diag.deepExtra": "deep scan found {count} unindexed",
  "settings.diag.noDeepScan": "no deep scan",
  "settings.diag.truncated": " (deep scan hit its directory limit)",
  "settings.diag.lastResult": "Last result",
  "settings.diag.newAndInherited": "{created} new · {inherited} renamed",
  "settings.diag.error": "Error",
  "settings.diag.platform": "Platform",
  "settings.diag.platformMobile": "Mobile",
  "settings.diag.platformDesktop": "Desktop",
};
