---
"@tabcanopy/extension": patch
---

Keep background service worker from going dormant when sidebar is closed

- Add chrome.alarms-based keepalive (1 min period) so the worker stays active for parent/child reconciliation
- Add "alarms" permission; keepalive alarm is scheduled on install and on each worker start
- Sidepanel ping keepalive remains as supplementary when sidebar is open
