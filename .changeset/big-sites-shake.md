---
"@tabcanopy/extension": patch
---

Fix Chrome Web Store upload failure detection and CI job summary

- Fixed publish-chrome.ts to properly parse API response and check uploadState
- Script now throws error when uploadState is "FAILURE" instead of incorrectly reporting success
- Added proper TypeScript types for Chrome Web Store API response
- Added detailed error messages showing error_code and error_detail from API
- Fixed GitHub Actions workflow to show job summary when packages are published
- Prevents silent failures during release process