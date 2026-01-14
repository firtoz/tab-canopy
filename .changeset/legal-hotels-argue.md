---
"@tabcanopy/extension": patch
---

Fix Firefox Add-ons publishing and improve release automation

- Fixed Firefox Add-ons submission by removing invalid `--id` argument from web-ext sign command
- Extension ID is now properly set via manifest.json during build process
- Added auto-generated AMO metadata from Chrome store descriptions (single source of truth)
- Added required license field (MIT) to AMO metadata
- Created Firefox API utility script for managing addons (list, info, delete)
- All store descriptions now stay in sync automatically
