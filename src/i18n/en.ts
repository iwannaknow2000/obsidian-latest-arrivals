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
  "menu.ignore": "Ignore from latest arrivals",
  "menu.openList": "Open \"Latest arrivals\" list",

  // ---- notices ----
  "notice.newArrivals": "Latest arrivals: {count} new note(s)",
  "notice.foundNew": "Found {count} new note(s)",
  "notice.noneNew": "No new notes (scanned {count} notes in {ms} ms)",
  "notice.noNotes": "Nothing has been recorded yet",
  "notice.openedCount": "Opened {count} note(s)",
  "notice.ledgerRebuilt": "Arrival times have been reset",
  "notice.ignored": "Ignored \"{name}\"",
  "notice.notIndexed": "\"{name}\" is not quite ready. Restart Obsidian and it will open normally.",
  "notice.fileNotFound": "File not found: {path}",
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
  "modal.subtitle": "{shown} newest · {total} notes in this vault",
  "modal.openFullList": "Open full list (with sorting)",
  "modal.rescan": "Look again",
  "modal.empty": "Nothing recorded yet. Tap the refresh button. The first run needs a moment to work out when each note arrived.",
  "modal.footerHint": "Tap to open · press and hold for the menu",
  "modal.footerStamp": "Most recent: {time}",
  "modal.scannedNew": "Found {count} new note(s) ({ms} ms)",
  "modal.scannedNone": "No new notes ({ms} ms)",

  // ---- sidebar view ----
  "view.filterPlaceholder": "Filter by title or path…",
  "view.countFiltered": "{shown} of {total} notes",
  "view.countAll": "{total} notes",
  "view.emptyFiltered": "No notes match your filter.",
  "view.emptyLedger": "Nothing recorded yet. Tap the refresh button. The first run needs a moment to work out when each note arrived.",
  "view.sortAsc": "Ascending (click for descending)",
  "view.sortDesc": "Descending (click for ascending)",
  "view.groupShow": "Show A–Z group headers",
  "view.groupHide": "Hide A–Z group headers",

  // ---- list rows ----
  "row.badgeNew": "New",
  "row.badgeUnindexed": "Not ready",
  "row.badgeUnindexedTooltip": "Restart Obsidian and this note will open normally",
  "row.arrivedAt": "Arrived {time}",

  // ---- settings: sections ----
  "settings.sectionEntry": "Where to find it",
  "settings.sectionScan": "Looking for new notes",
  "settings.sectionMaintenance": "Fixing things",
  "settings.sectionDiagnostics": "Details",

  // ---- settings: general ----
  "settings.intro": "The plugin remembers when each note first arrived on this device. That record is kept on the device only and is never synced.",
  "settings.language.name": "Interface language",
  "settings.language.desc": "Follows Obsidian by default. Changing this reloads the plugin.",
  "settings.language.auto": "Auto (follow Obsidian)",

  "settings.quickCount.name": "How many notes to show",
  "settings.quickCount.desc": "In the short list that opens from the command, the sidebar or your shortcut (1-10).",
  "settings.sortKey.name": "Sort notes by",
  "settings.sortKey.desc": "Used first, whenever the full list opens.",
  "settings.sortDesc.name": "Sort downwards",
  "settings.sortDesc.desc": "Newest or largest at the top.",
  "settings.group.name": "Group by first letter",
  "settings.group.desc": "Only when sorting by pinyin initials.",
  "settings.openIn.name": "Open a note in",
  "settings.openIn.desc": "A new tab leaves the current note open. The current tab saves screen space on a phone.",
  "settings.openIn.current": "The current tab",
  "settings.openIn.newTab": "A new tab",
  "settings.sidebar.name": "Show in the sidebar",
  "settings.sidebar.desc": "Adds a tab to the sidebar. Once you open it, Obsidian remembers it.",
  "settings.sidebar.right": "Right sidebar (recommended)",
  "settings.sidebar.left": "Left sidebar",
  "settings.sidebar.off": "Don't show it",

  // ---- settings: mobile hint ----
  "settings.mobile.title": "How to reach it from the ☰ button on a phone",
  "settings.mobile.step1": "Open Settings → Appearance and scroll down to \"Advanced\".",
  "settings.mobile.step2": "Under \"Ribbon menu\", choose \"Manage\".",
  "settings.mobile.step3": "Find \"Latest arrivals\" and click the green ➕ next to it.",
  "settings.mobile.step4": "The ☰ button at the bottom right will now show it. You can also set the ☰ short-press action to open it directly.",
  "settings.mobile.note": "Plugin icons start out hidden in Obsidian's mobile ribbon menu and must be added by hand once.",

  // ---- settings: scanning ----
  "settings.rescanForeground.name": "Look for new notes when you come back",
  "settings.rescanForeground.desc": "On a phone, files often arrive while Obsidian is in the background. This looks again as soon as you return.",
  "settings.deepScan.name": "Also look inside the vault folder",
  "settings.deepScan.desc": "Finds notes that have arrived but that Obsidian has not noticed yet. Slower than the normal check.",
  "settings.deepScanInterval.name": "How often to look inside the folder",
  "settings.deepScanInterval.desc": "In seconds. 0 means every time.",

  "settings.folders.name": "Folders to leave out",
  "settings.folders.desc": "Notes in these folders will not appear in any list.",
  "settings.folders.button": "Choose folders…",
  "settings.folders.none": "No folders chosen",
  "settings.folders.summary": "{count} left out: {list}",
  "settings.patterns.name": "Extra rules",
  "settings.patterns.desc": "Usually not needed. One rule per line; * and ? stand for any characters.",
  "folderPicker.title": "Choose folders to exclude",
  "folderPicker.search": "Filter folders…",
  "folderPicker.selectAll": "Select all shown",
  "folderPicker.clear": "Clear all",
  "folderPicker.count": "{selected} selected · {total} folders",
  "folderPicker.empty": "No folders match your filter.",
  "folderPicker.confirm": "Done",
  "folderPicker.cancel": "Cancel",

  // ---- settings: maintenance ----
  "settings.rescanNow.name": "Look for new notes now",
  "settings.rescanNow.desc": "Checks right away instead of waiting.",
  "settings.rescanNow.button": "Check now",
  "settings.rebuild.name": "Start the arrival times over",
  "settings.rebuild.desc": "Clears what this device remembers. The next check works it out again from the files' own dates.",
  "settings.rebuild.button": "Start over",
  "settings.ignored.name": "Hidden notes ({count})",
  "settings.ignored.desc": "These notes are kept out of every list.",
  "settings.ignored.restore": "Show them again",

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
  "settings.diag.pinyinOk": "Available ({locale})",
  "settings.diag.pinyinFallback": "Not available on this device, so Chinese file names sort by character code instead of pinyin",
  "settings.diag.ledger": "Notes remembered",
  "settings.diag.lastRefresh": "Last check",
  "settings.diag.never": "Not yet",
  "settings.diag.elapsed": "{time} · took {ms} ms",
  "settings.diag.lastScan": "Last check covered",
  "settings.diag.indexed": "{count} notes Obsidian knows about",
  "settings.diag.deepExtra": "found {count} more inside the folder",
  "settings.diag.noDeepScan": "did not look inside the folder",
  "settings.diag.truncated": " (stopped early - too many folders)",
  "settings.diag.lastResult": "Found",
  "settings.diag.newAndInherited": "{created} new · {inherited} renamed",
  "settings.diag.error": "Error",
  "settings.diag.platform": "Running on",
  "settings.diag.platformMobile": "Mobile",
  "settings.diag.platformDesktop": "Desktop",
};
