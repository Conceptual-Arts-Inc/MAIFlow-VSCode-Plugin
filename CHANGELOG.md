# Change Log

All notable changes to the MAIFlow VS Code extension are documented here.

## 1.0.3

- Use the MAIFlow logo for the extension icon while retaining `resources/maiflow-view.svg` for the Activity Bar.

## 1.0.2

- Fixed score decoding for boundary values and numeric-string payloads so valid `0` and `10` values are preserved instead of replaced by defaults.
- Added score-field aliases used by MAIFlow task payloads.

## 1.0.1

- Refined the task view with a compact toolbar, clear filter summary, concise task rows, and calmer empty/loading/error states.
- Grouped task editing into details, planning, and context sections with a cleaner VS Code-native layout.
- Fixed MAIFlow engine-score parsing so the read-only score keeps its server value instead of being clamped to the 0–10 input-score range.

## 1.0.0

- Added secure MAIFlow MCP configuration using VS Code Secret Storage.
- Added MAIFlow Activity Bar task view with filters, refresh, stale/offline state, and workspace mapping.
- Added task creation, detail editing, status/score updates, and browser deep links.
- Added connection testing, Profile/settings actions, and redacted MCP setup-template copying.
