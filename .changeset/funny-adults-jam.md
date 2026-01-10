---
"@tabcanopy/extension": patch
---

Refactor IDB transport adapter with real connection state management

- Replace timer-based ready state with actual connection state tracking based on pong events
- Add automatic retry logic with exponential backoff for connection failures
- Remove unnecessary BackgroundApiContext and TestActionsContext layers
- Simplify App.tsx from 249 lines to 60 lines (76% reduction)
- Add useIdbAdapter() hook for direct access to all adapter methods
- Improve connection reliability and lifecycle management

Implement collapse-aware tab closing behavior

- **Non-collapsed parent tabs**: Children are promoted to become siblings when parent is closed
- **Collapsed parent tabs**: All descendants are closed recursively when parent is closed
- Fix critical bug: UI close button now respects collapse state (was always closing all descendants)
- Update handleTabRemoved() in background to check isCollapsed state
- Update closeTab() in UI store to check isCollapsed before closing descendants
- Add defensive orphaned tab handling in buildTabTree() as display layer safety net
- Add comprehensive test coverage: UI close, browser-native close, deep nesting scenarios

Fix promoted children positioning in tree

- **Issue**: When closing a non-collapsed parent, promoted children kept their old treeOrder (relative to siblings under parent), causing them to appear at wrong position (often before parent's previous sibling)
- **Fix**: Generate new treeOrders for promoted children based on parent's position among its siblings
- Children now appear exactly "where the parent was" in the tree, between parent's former siblings
- Preserves relative order among promoted children
