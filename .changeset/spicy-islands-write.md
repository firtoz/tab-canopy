---
"@tabcanopy/extension": patch
---

Fix middle-click to close tabs and windows

- Fixed middle-click (auxclick) on tabs not closing them - the handler was incorrectly placed in onClick instead of onAuxClick
- Fixed middle-click on windows to properly use onAuxClick event handler
- Added middle-click handler to DraggableTab wrapper for reliable event handling
