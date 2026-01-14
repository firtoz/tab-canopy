---
"@tabcanopy/extension": patch
---

Add manifest validation to prevent duplicate Firefox addon submissions

- Added validation check that verifies extension ID is in manifest before submission
- Script now fails early if extension ID is missing, preventing accidental duplicate addons
- Changed to use Bun.spawn() with explicit environment for reliable env var passing
