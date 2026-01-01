---
"@tabcanopy/extension": patch
---

Infrastructure improvements for release automation:

- Set up Changesets for automated versioning and release management
- Migrated publishing workflow from direct GitHub Actions to Changesets-based flow
- Refactored publishing scripts to use Bun's native APIs with proper module exports
- Added comprehensive release documentation in docs/RELEASING.md
- Updated README with new release workflow information

These changes improve the development workflow but don't affect the extension functionality.
