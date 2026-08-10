# Changelog

All notable changes to Homepage Studio are documented in this file.

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
