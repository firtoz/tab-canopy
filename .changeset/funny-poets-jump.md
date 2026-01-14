---
"@tabcanopy/extension": patch
---

Fix Firefox extension ID not being passed to build process

- Firefox extension ID now correctly passed to build process via shell environment variable syntax
- Added manifest verification step to confirm extension ID is properly set before submission
