---
"@tabcanopy/extension": minor
---

Re-architect tab sync and tree logic (intent-first, pure functions, single reconciler)

- **Single reconciliation loop**: New `reconciler.ts` is the only writer to DB; handlers enqueue events to `tab-sync-events.ts` types; reconciler drains queue and applies tree-sync + DB writes. Replaces scattered handler writes with one ordered flow.
- **Pure tree module** ([tree-sync.ts](packages/extension/entrypoints/background/tree-sync.ts)): Add `inferTreeFromBrowserMove`, `promoteOnRemove`, `inferTreeFromBrowserCreate`, `flattenTreeToBrowserOrder`; keep `calculateTreePositionFromBrowserMove` as legacy wrapper.
- **handleTabMoved**: Use `inferTreeFromBrowserMove` for full updates map; single `putItems` for all tabs in window (intent-first, then infer).
- **handleTabRemoved**: Use `promoteOnRemove(existingTabs, tabId)` for direct-children promotion; remove inline sibling/child logic.
- **handleTabCreated / handleTabAttached**: Use `inferTreeFromBrowserCreate` (with optional browser indices) for new-tab tree position.
- E2E: "moving parent tab in native browser after its child maintains correct order" passes; new "moving parent tab between its child and next tab" and "db sync" tests; two tests may still be flaky (promotion sync timing, move-before-parent sync).
