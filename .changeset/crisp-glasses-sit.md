---
"@tabcanopy/extension": patch
---

Fix Firefox extension ID passing with proper Turbo cache configuration

- Configured Turbo to track `FIREFOX_EXTENSION_ID` env var for cache invalidation
- Changed to use `Bun.spawn()` with explicit environment for reliable env var passing
- Added detailed logging to debug environment variable state during build
- Turbo now automatically rebuilds when extension ID changes, uses cache when it matches
