# Latest Arrivals

[![Release](https://img.shields.io/github/v/release/iwannaknow2000/obsidian-latest-arrivals?label=release)](https://github.com/iwannaknow2000/obsidian-latest-arrivals/releases/latest)
[![CI](https://github.com/iwannaknow2000/obsidian-latest-arrivals/actions/workflows/release.yml/badge.svg)](https://github.com/iwannaknow2000/obsidian-latest-arrivals/actions/workflows/release.yml)

**Find the notes that most recently arrived in your vault, and open them in one tap.**

If you sync your vault to your phone with Syncthing, Resilio or anything similar, this answers a simple
question: *which notes just arrived?* Note that it is not the same as Obsidian's own recent-files list, which
remembers what you **opened** — this remembers what **arrived**.

Built for synced vaults and tuned for Android. It exists because plugins that show "recently added files" rely
on Obsidian's `create` event, so they never notice files that appear while Obsidian is closed — which is exactly
when a sync tool does its work.

[中文说明（更通俗的版本）→](README.zh-CN.md)

| | |
|---|---|
| Plugin ID | `latest-arrivals` |
| Sort keys | Arrival time · file name (pinyin initials) · created time · modified time · size |
| Interface language | English, 简体中文, 繁體中文 — follows Obsidian by default |
| Bundle | `main.js` ~81 KB (gzip ~21 KB), **zero runtime dependencies** |
| Platform | Android, iOS, and desktop (`isDesktopOnly: false`) |
| Minimum Obsidian | 1.8.7 |
| Network | **None.** No requests, no telemetry, no self-updating |

---

## 1. Why other "recently added" plugins miss synced notes

Plugins such as [Recently Added Files](https://github.com/Lemon695/obsidian-recently-added-files) listen only to
Obsidian's `create` event, and register that listener *after* the workspace is ready. Files written by an external
sync tool arrive while Obsidian is closed, so they are picked up by the startup scan and **never fire an event**.
They are silently missed.

This plugin does not depend on event timing: every refresh performs a **full-vault set difference**.

> **Relationship to Recently Added Files.** This project is **not a fork** and contains no code from it. Its
> source was read only to diagnose the cause above, and credit is due for that starting point.

---

## 2. How it works

The plugin keeps a table of **path → first-observed time**. Where that table lives is the crux:

| Storage | Synced between devices? | |
|---|---|---|
| `data.json` in the plugin folder | Yes | ❌ devices overwrite each other |
| **`App.saveLocalStorage()`** | **No** | ✅ device-local, per vault |

Every refresh:

1. **Fast path** — `vault.getMarkdownFiles()` plus in-memory `TFile.stat`. No I/O, milliseconds.
2. **Deep path** — an optional recursive `adapter.list`, to catch files Obsidian has not indexed yet.
3. **Reconcile** — known paths keep their frozen arrival time; a vanished path whose replacement has an identical
   `size` and `mtime` is treated as a rename and inherits it; anything else is a new arrival.

Arrival time is the default sort key because it is the only signal that does not depend on file attributes.
An external sync tool **preserves `mtime`**, so `mtime` really means "when you wrote the note elsewhere", and
`ctime` is [unreliable on Android](https://github.com/syncthing/syncthing/commit/16ae1fbe5e77b682aff1c546fe20bf3904cd42df).
A newly discovered file therefore uses `max(ctime, mtime)` when that falls in the window since the last scan,
and is otherwise recorded as arriving now — so a freshly synced note always sorts to the top.

---

## 3. Permissions and data access

Obsidian's directory asks plugins to disclose what they touch. This plugin:

| Behaviour | Why |
|---|---|
| **Enumerates the vault** (`vault.getMarkdownFiles()`, plus an optional recursive `adapter.list`) | It has to see the full set of notes in order to compute "what is new". The deep scan exists to catch files Syncthing has written but Obsidian has not indexed yet, and can be turned off in settings. |
| **Reads and writes vault files** | Reads notes to open them; writes only the optional configuration export at the vault root. |
| **Clipboard** | **None.** The plugin neither reads nor writes the clipboard. |
| **Device-local key/value storage** (`App.saveLocalStorage`) | Stores the arrival ledger and a settings backup. Never synced. |
| **Network** | **None.** No network requests, no telemetry, and the plugin does not update itself or its dependencies. |
| **Access outside the vault** | **None.** No Node/Electron APIs, no `adapter.getFullPath()`. The deep scan starts at the vault root and only ever descends into directories it listed itself. |

---

## 4. Features

### Sorting — five keys, ascending or descending

`File name (pinyin initials)` · `Arrival time` · `Created time` · `Modified time` · `Note size`

Pinyin sorting is implemented with **zero dependencies**. The JavaScript runtime's ICU already ships Chinese
collation, so the plugin binary-searches a small table of syllable-boundary characters to find a character's
initial, then applies a sub-1 KB override table for polyphonic characters. Verified results:

```
知识管理→ZSGL  本地部署→BDBS  微信→WX  数学→SX  法律→FL  经济→JJ
物理→WL  化学→HX  中国→ZG  北京→BJ  上海→SH  长沙→CS  厦门→XM
```

At startup the plugin self-tests whether `Intl.Collator('zh')` really has pinyin data. If the device's WebView
lacks it, sorting degrades to code-point order **and says so in the settings**, rather than silently producing
the wrong order.

### Entry points

| Entry | Notes |
|---|---|
| **Sidebar tab** (recommended) | Mounted automatically; position (left / right / off) is configurable |
| **Command palette** | `Latest Arrivals: Open latest arrivals` |
| **Quick Action** (mobile) | Point it at *Open latest arrivals* and a pull-down from the top of the screen opens the list |
| **Editor toolbar** (mobile) | Settings → Interface → Toolbar → add the command |
| File context menu | *Open "Latest arrivals" list* · *Ignore from latest arrivals* |

The quick list shows 1–10 notes (configurable). Tap a row to open it; long-press for the context menu.

> **On mobile there is no ribbon to configure.** Obsidian's mobile app has no ribbon settings page (searching
> settings for "Ribbon" finds nothing), which is why the sidebar tab and the Quick Action are the recommended
> entry points there.

### Excluding folders

Settings → Latest Arrivals → Scanning → **Excluded folders** → **Choose folders…**

A searchable checkbox list of every folder in the vault. Tick one and that folder and everything under it is
left out of every list — no glob syntax required.

The matcher is anchored (`^Folder/`), so excluding `Archive` does **not** affect `MyArchive/`.
A free-text **Additional exclusion rules** box remains for wildcard cases such as `Archive/20??/*`.

### Configuration backup: export and import

Settings → Latest Arrivals → **Configuration backup**

| Button | Effect |
|---|---|
| **Export** | Writes the current settings to `latest-arrivals-settings.json` at the vault root |
| **Import** | Pick a JSON file from the vault and apply it (validated first; unknown keys are ignored) |

Writing the file **into the vault** is deliberate: it syncs to your other devices, so you can export on your
computer and import on your phone, or vice versa. Import only overwrites keys that appear in the file.

### Settings self-healing

Settings live in the plugin folder's `data.json`, which is Obsidian's convention — but that file sits **inside
the plugin directory**, so manually deleting and re-copying that folder takes your settings with it.

The plugin therefore **also mirrors settings into device-local storage** (the same place as the ledger, outside
the plugin folder). If `data.json` goes missing, the settings are restored from the backup on startup, with a
notice telling you so.

---

## 5. Interface language

The plugin is **English by default** and follows your Obsidian interface language automatically. You can also
pin it under **Settings → Latest Arrivals → Interface language**.

| Language | Status |
|---|---|
| English | Default, and the fallback for any missing key |
| 简体中文 | ✅ |
| 繁體中文 | ✅ |

Command names, the ribbon tooltip, and the view title are registered when the plugin loads, and Obsidian has no
API to rename them. Changing the language therefore reloads the plugin; if that fails, you'll be asked to toggle
it off and on manually.

Adding a language means one new file in `src/i18n/` plus one line in `LOCALES`. `npm test` asserts that every
bundle has an identical key set and identical `{placeholder}` usage.

> The `name` and `description` in `manifest.json` are read directly by Obsidian and **cannot vary by language**,
> so the plugin list always shows the English name.

---

## 6. Installation

### Option A — BRAT (one-tap updates)

1. Install the **BRAT** community plugin (`obsidian42-brat`).
2. Run **BRAT: Add a beta plugin for testing** from the command palette.
3. Enter: `iwannaknow2000/obsidian-latest-arrivals`
4. Enable **Latest Arrivals** under Settings → Community plugins.

To update later, run **BRAT: Check for updates to all beta plugins**.

### Option B — manual copy

1. Download `main.js`, `manifest.json`, and `styles.css` from the
   [latest release](https://github.com/iwannaknow2000/obsidian-latest-arrivals/releases/latest).
2. Copy them into `<your vault>/.obsidian/plugins/latest-arrivals/`.
3. Fully quit and reopen Obsidian, then enable the plugin under Settings → Community plugins.

> **Overwrite the three files; do not delete the folder** — `data.json` lives there. (And if you do delete it,
> the settings backup described above restores your configuration.)

### ⚠️ Obsidian's built-in "Check for updates" does nothing for this plugin

**Settings → Community plugins → Check for updates** only compares against the **official plugin directory**.
This plugin is not listed there, so that button will never find an update for it. This is by design, not a bug.

| Installed via | How to update |
|---|---|
| BRAT | Settings → BRAT → **Check for updates to all beta plugins** |
| Manual copy | Re-copy the three files and restart Obsidian |
| Official directory (once listed) | The built-in **Check for updates** button |

---

## 7. Development

```bash
npm install
npm run dev          # watch build (writes main.js with an inline sourcemap)
npm test             # 54 logic assertions + 29 runtime smoke assertions
npm run lint         # official rule set, with type-checked rules
                     # (the directory's source-code review runs the same set)
npm run build        # type-check + production build
npm run release:dry  # show what a release would do, without changing anything
npm run release      # bump version, commit, tag, push → CI builds and publishes
```

### Layout

```
src/
├── main.ts            Plugin entry: commands, ribbon icon, sidebar tab, settings, foreground rescan
├── ledger.ts          Arrival ledger (device-local persistence, reconciliation, rename inheritance)
├── scanner.ts         Fast path (vault index) + deep path (recursive adapter traversal)
├── service.ts         Data core: scan → reconcile → sort → expose to the UI
├── sort.ts            Five sort keys + exclusion matchers
├── settings-io.ts     Configuration export and import
├── pinyin.ts          Syllable-boundary binary search + polyphone table + capability self-test
├── format.ts          Byte and time formatting
├── settings.ts        Settings tab + diagnostics panel
├── types.ts           Shared types and defaults
├── i18n/              en / zh-CN / zh-TW bundles
└── ui/                Modal, sidebar view, row renderer, folder picker
test/
├── run.ts             Logic assertions (bundled by esbuild, run by Node)
├── smoke.cjs          Runtime smoke test (stubbed Obsidian, loads the real build output)
└── stub/              Minimal Obsidian API stub
```

### Test coverage

**Logic (`test/run.ts`, 54 assertions):** pinyin initials and polyphones; key-set and placeholder parity across
all three language bundles; ascending and descending order for all five sort keys; exclusion-folder anchoring,
escaping and false-positive checks; ledger baseline, idempotent rescans, frozen `firstSeen`, incremental
discovery, rename inheritance, delete-and-restore, arrival-window clamping, persistence round-trip.

**Runtime smoke (`test/smoke.cjs`, 29 assertions):** loads the actual build output with a stubbed Obsidian module
and runs `onload()` end to end — command, view and ribbon registration, automatic sidebar mounting (including
position and "does not steal focus"), sidebar relocation and deduplication, all five sort keys, the ledger
landing in device-local storage, incremental discovery, and ignoring.

---

## 8. Known limitations

- **No network access at all.** No requests, no telemetry, no self-updating.
- **Polyphonic characters:** only the roughly 40 characters whose readings differ in *initial letter* are
  overridden (长, 厦, 传, …). A complete dictionary costs several hundred KB, which conflicts with staying light.
- **Deep scan cost:** `adapter.list` is one bridge call per directory. On a vault of a few thousand notes this
  takes 1–2 seconds, so it is throttled to once every 180 s by default. It can be tuned or disabled.
- **Files not yet indexed by Obsidian:** the deep scan can detect them and record their arrival time, but opening
  one prompts you to restart Obsidian. After a restart it appears in its normal place.
- **`data.json` is synced** between devices (settings), while the **arrival ledger is not** (it lives in
  device-local storage), so each device keeps its own arrival times.
- **Changing the language re-keys the ribbon item.** Obsidian builds a ribbon item's ID from its title, so
  switching the interface language can drop the plugin from a configured ribbon menu. Pick your language first.
- **Settings do not appear in Obsidian's settings search.** The official lint suggests adopting
  `getSettingDefinitions()`, the declarative settings API introduced in **Obsidian 1.13.0**. This plugin's
  `minAppVersion` is **1.8.7**, and using a 1.13-only API would lock out every user on an older build, so it
  deliberately keeps `display()`. The trade-off is recorded in `eslint.config.mjs`.

---

## License

[MIT](LICENSE)
