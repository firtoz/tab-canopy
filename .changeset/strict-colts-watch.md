---
"@tabcanopy/extension": patch
---

Infrastructure improvements for release automation:

- Set up Changesets for automated versioning and release management
- Migrated publishing workflow from direct GitHub Actions to Changesets-based flow
- Refactored publishing scripts to use Bun's native APIs with proper module exports
- Added comprehensive release documentation in docs/RELEASING.md
- Updated README with new release workflow information
- Added GitHub Actions workflow annotations and job summaries for better visibility
- Fixed .gitignore to exclude Google Cloud credentials files (gha-creds-*.json)
- Fixed .gitattributes to properly treat icon PNG files as binary (prevents corruption)
- Added comprehensive Cursor rules for changeset workflow management
- Created version-controlled store metadata structure (store-metadata/) for Chrome and Firefox

These changes improve the development workflow but don't affect the extension functionality.
