---
"@tabcanopy/extension": patch
---

Fix multiple tabs appearing active in the same window

- Fixed race condition where multiple tabs could appear as "active" in the same window
- `handleTabActivated` now explicitly sets active state based on `activeInfo.tabId` rather than relying on browser query results which could be stale
- All other event handlers now preserve the DB's active state for existing tabs instead of overwriting with potentially incorrect browser state
- Only `handleTabActivated` should change which tab is active

Fix infinite IndexedDB connections

- Fixed issue where infinite database connections were being created due to using adapter creator function instead of the context consumer
- Refactored `IdbTransportAdapterProvider` to properly manage connection lifecycle
