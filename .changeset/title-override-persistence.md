---
"@tabcanopy/extension": minor
---

Title override persistence and test robustness

- **Title override persistence**: Renaming a tab or window in the sidepanel now persists to the background IDB. Added `patchTab` and `patchWindow` client messages; background merges `titleOverride` and broadcasts sync. Sidepanel sends patch after local collection update in `renameTab`/`renameWindow`.
- **Close test**: Wait for parent tab to disappear from sidepanel before asserting promotion; poll for promoted child; preserve `titleOverride` and `isCollapsed` when promoting children in `handleTabRemoved`.
- **Move test**: Clarified comment that moving tab to `bTab.tabIndex` yields [b, a, c] (Chrome move index semantics).
