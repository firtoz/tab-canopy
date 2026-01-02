---
"@tabcanopy/extension": patch
---

Remove DevTools panel and event recording system

- Removed DevToolsPanel UI component and related toggle button
- Removed event recording/replay system (DevToolsProvider, useDevTools hook)
- Removed all recordUserEvent calls throughout the codebase
- Removed TabTreePreview component (was only used by DevTools)
- Cleaned up unused state management related to DevTools
- This functionality has been superseded by comprehensive e2e tests
