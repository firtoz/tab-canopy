---
"@tabcanopy/extension": patch
---

Fix tab movement and tree hierarchy issues

- **Fix flattening when parent moved past children**: When a parent tab is moved past its child in the native browser, the child now correctly becomes a root-level tab (flattened hierarchy)
- **Fix UI move intent TTL handling**: Creation-time intents now use a shorter 500ms TTL to avoid interfering with subsequent user-initiated moves, while explicit UI moves retain the 5s TTL
- **Fix tab move simulation**: Corrected how browser tab moves are simulated in `calculateTreePositionFromBrowserMove` to properly model Chrome's remove-then-insert behavior
- **Fix context menu new tab positioning**: New tabs created via context menu on a parent with existing children now correctly appear first in the tree view (respecting the native browser position)
