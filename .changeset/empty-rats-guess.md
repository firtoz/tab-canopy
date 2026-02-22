---
"@tabcanopy/extension": patch
---

Fix second update overwriting parent: handleTabUpdated no longer overwrites tree structure

- Tree structure (parentTabId, treeOrder) is owned only by create/move/remove handlers
- handleTabUpdated re-reads up to twice when tab is missing so it does not overwrite a just-written row from handleTabMoved or handleTabRemoved
- handleTabUpdated skips writing when it would write parentTabId null (unless UI intent), so promoted/moved tabs are never reverted to root
- updateTabIndicesInWindow re-reads once when tabs are missing from the initial map to preserve promoted children
