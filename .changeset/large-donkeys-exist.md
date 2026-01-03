---
"@tabcanopy/extension": patch
---

Fix tab ordering issues with opener-based and position-based child tab creation

- Add automatic repositioning of tabs created with `openerTabId` to be adjacent to their siblings in the browser
- Improve tree structure adherence by ensuring child tabs are physically next to their parent and siblings
- Fix context menu "New Tab" to place new tabs in the correct tree position (respecting native browser position)
- Add comprehensive E2E tests for tab ordering scenarios:
  - Creating multiple children via `window.open` maintains creation order
  - Tabs with opener created far from parent are moved to be adjacent
  - New children appear after last child even when intermediate children are moved
  - Context menu "New Tab" respects native browser position in tree
  - Browser-native close (Ctrl+W) promotes children to grandparent
  - Complex tree drag to new window: drag subtree into sibling, then to new window
- Improve `dragTabToNewWindow` test fixture to wait for all descendants to move (not just parent)
- Fix issue where tabs with opener were shown as children in the tree but positioned far away in the browser tab bar
- Improve `calculateTreePositionForNewTab` to better account for browser index shifts when determining tree order
- Fix `handleTabUpdated` to respect UI move intents, preventing treeOrder from being overwritten during tab updates
- Fix click-to-rename triggering on active tab of non-current window (should focus window instead)
- Add GitHub releases with extension zip files and changelog information when publishing to stores
