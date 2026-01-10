---
"@tabcanopy/extension": patch
---

Fix tabs created with openerTabId not becoming children of opener

- **Issue**: When ctrl-clicking a link or creating a tab via window.open(), the new tab has an openerTabId but was not always becoming a child of the opener tab in the tree structure. Position-based logic could incorrectly determine the parent, and the opener-based logic only ran if position-based logic returned null.
- **Fix**: Prioritize openerTabId over position-based logic in handleTabCreated(). When a tab has an openerTabId, always use it as the parent, regardless of where Chrome placed the tab in the tab bar.
- The tab creation logic now:
  1. Checks for openerTabId FIRST and uses it as parent if present
  2. Falls back to position-based logic only if no openerTabId
- **Impact**: Tabs created via ctrl+click, context menu "New Tab", and window.open() now correctly appear as children of the opener tab, maintaining proper tree hierarchy.
- Add comprehensive e2e test: "ctrl-clicking link creates child tab after existing children"
