# Changelog

All notable changes to Homepage Studio are documented in this file.

## 1.2.1 — 2026-09-02

### Fixed

- Removed new-tab stutter caused by rebuilding the complete homepage snapshot whenever Obsidian requested the Homepage Studio tab title.
- Deferred hidden homepage renders, used lightweight same-day clock updates, and eliminated redundant state cloning and cross-date refreshes.
- Filtered and batched vault resource events so unrelated file changes and bulk imports do not trigger repeated homepage rebuilds.
- Read editor content only after heatmap debounce, delegated heatmap interactions at grid level, and debounced text-heavy settings updates.
- Released clock listeners when pop-out windows close and loaded large Banner images lazily with asynchronous decoding hints.

### Performance

- Reduced 100 unrelated vault changes to zero homepage snapshots and a related batch to one snapshot.
- Reduced heatmap cell event listeners from two per day to two listeners for the complete grid.

## 1.2.0 — 2026-08-25

### Added

- Added press-and-hold file entry reordering within and across file groups on both the homepage and settings page, with atomic persistence that preserves entry identities.
- Added press-and-hold task reordering within incomplete, completed, and archived task lists.
- Added a task setting that can hide the archived-task entry point on the homepage.

### Fixed

- Preserved task drafts and journal focus across clock refreshes, window visibility changes, and view rebuilds.
- Stabilized file and task drag previews, drop targeting, pointer feedback, cleanup, and ordering during live clock updates.
- Allowed unchanged task edits to close normally and shortened the edit action label to Save.
- Accepted the archive-toggle setting in persisted plugin data without entering read-only safe mode.

### Release

- Added pull-request CI and combined curated 1.2.0 highlights with GitHub-generated release notes.

## 1.1.1 — 2026-08-20

### Fixed

- Preserved the journal editor input session when the first entry of a new day is autosaved.

## 1.1.0 — 2026-08-13

### Added

- Added daily and weekly recurring Homepage tasks managed from plugin settings.
- Reset recurring task completion automatically at the start of each day or week while keeping task files queryable.

### Fixed

- Stabilized recurring task parsing, conflict reporting, serialized writes, and startup refresh behavior.
- Completed settings search coverage for recurring-task and template-related options.
- Preserved task input surfaces when hovering in the Klein blue and Celestial orbit themes.

## 1.0.3 — 2026-08-10

### Fixed

- Kept journal editor focus and caret position stable after Chinese IME input and autosave.
- Prevented a journal's own save event from rebuilding the active editor unnecessarily.
- Moved daily and weekly plan period validation messages next to the affected Save period button.

## 1.0.2 — 2026-08-10

### Fixed

- Restored file-path autocomplete for Banner images, file groups, missing-file replacement, journals, and task sources.
- File suggestions now share a lazy cache while settings are open and refresh after vault files are created, deleted, or renamed.

## 1.0.1 — 2026-08-10

### Changed

- Removed vault-wide file enumeration from settings path inputs; paths are now validated by direct lookup.
- Removed system clipboard access. Conflict drafts and diagnostic reports remain selectable in the interface for manual recovery.
- Replaced CSS features that are only partially supported by the Obsidian 1.7.4 compatibility scanner.

### Release

- Added GitHub artifact provenance attestations for `main.js` and `styles.css`.
- Release titles now contain only the version number.

## 1.0.0 — 2026-08-10

### Added

- Dedicated desktop homepage with six responsive themes and light/dark appearances.
- Writing heatmap with date details and configurable retention and thresholds.
- Date-section journal with edit/preview navigation and conflict-safe writes.
- Active and archived Homepage tasks with conflict handling and pagination.
- Daily and weekly plans, overnight blocks, current-period status, and templates.
- Curated file groups, missing-file recovery, rename tracking, and accessible navigation.
- Vault and optional remote banners with original offline fallback artwork.
- Chinese and English interfaces, layout editor, backup/reset flow, keyboard support, reduced motion, and safe mode for invalid plugin data.

### Security and privacy

- No telemetry, analytics, crash reporting, hidden network request, or runtime CDN.
- User-configured remote Banner URLs are the only optional external request.
- Plugin data is serialized, backed up, schema-validated, and never replaced with defaults when corrupt.

### Compatibility

- Supports Obsidian desktop 1.8.7 or later; the development API types are pinned to the same baseline.

### Known persistence boundary

Normal plugin disable attempts to flush pending plugin data, journal drafts, and heatmap counters. Operating-system force quit, power loss, or termination before a debounced write completes can lose changes that existed only in memory. Restart restores the last successfully persisted data and does not silently overwrite corrupt data.
