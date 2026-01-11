# Firefox Release Setup - Quick Start Guide

## What's Been Done

✅ **Release workflow updated** (`.github/workflows/release.yml`)
- Now builds **both Chrome and Firefox** versions
- Passes Firefox API credentials to the release script
- Updates job summary to show both browser statuses
- **Inert when secrets are missing** - won't fail the workflow

✅ **Manual build workflow created** (`.github/workflows/build-artifacts.yml`)
- Can be triggered from GitHub Actions UI
- Select which browsers to build (Chrome, Firefox, or both)
- Downloads artifacts without creating a release
- Perfect for testing builds before release

✅ **Firefox publishing implemented** (`scripts/publish-firefox.ts`)
- Uses `web-ext sign` to upload to Mozilla Add-ons
- Gracefully skips if API credentials are missing
- Builds Firefox version and submits for review
- Creates zip file for GitHub release

✅ **Release script updated** (`scripts/release.ts`)
- Handles both Chrome and Firefox publishing
- Continues even if Firefox publishing fails
- Creates GitHub releases with both zip files

✅ **Dependencies added**
- `web-ext` package added to workspace catalog (^8.4.0)
- Root package uses `"web-ext": "catalog:"` for consistent versioning
- Available to extension package if needed via catalog reference

✅ **Documentation created** (`docs/FIREFOX_SETUP.md`)
- Complete step-by-step setup guide
- Instructions for obtaining Firefox API credentials
- GitHub secrets configuration
- Troubleshooting tips

## What You Need to Do

### Step 1: Manual Firefox Upload (One-Time)

1. **Build the Firefox extension:**
   ```bash
   bun run zip:firefox
   ```

2. **Upload to Firefox Add-ons:**
   - Go to: https://addons.mozilla.org/developers/
   - Click "Submit a New Add-on"
   - Upload `packages/extension/.output/*-firefox.zip`
   - Fill in listing info (use content from `store-metadata/firefox/`)
   - Submit for review

3. **Note your Add-on ID:**
   - After submission, save the add-on ID from the URL
   - Example: `tab-canopy` or `{12345678-1234-1234-1234-123456789012}`

### Step 2: Generate API Credentials

1. **Go to API Credentials page:**
   - Visit: https://addons.mozilla.org/en-US/developers/addon/api/key/

2. **Generate credentials:**
   - Click "Generate new credentials"
   - Name: `GitHub Actions CI/CD`
   - Save both:
     - **JWT issuer** (API key) - looks like `user:12345:67`
     - **JWT secret** (long random string)

### Step 3: Configure GitHub Secrets

Go to your repository → **Settings** → **Secrets and variables** → **Actions**

#### Add Secrets (Secrets tab):

1. **`FIREFOX_API_KEY`**
   - Value: Your JWT issuer (e.g., `user:12345:67`)

2. **`FIREFOX_API_SECRET`**
   - Value: Your JWT secret

#### Add Variable (Variables tab):

1. **`FIREFOX_EXTENSION_ID`**
   - Value: Your add-on ID (e.g., `{12345678-1234-1234-1234-123456789012}`)
   
2. **`ENABLE_FIREFOX_PUBLISHING`**
   - Value: `false` (initially, until Mozilla approves first submission)
   - Change to `true` after approval to enable automated publishing

### Step 4: Test the Setup

#### Option A: Manual Build (No Release)

1. Go to GitHub → **Actions** → **Build Extension Artifacts**
2. Click **"Run workflow"**
3. Select browsers to build
4. Download artifacts from the workflow run

#### Option B: Full Release (with Changeset)

1. Create/update a changeset if you have changes
2. Push to main
3. The release workflow will:
   - Build both Chrome and Firefox
   - Upload Chrome to Chrome Web Store (draft)
   - Upload Firefox if `ENABLE_FIREFOX_PUBLISHING=true` (skip if false)
   - Create GitHub release with both zips

**Note**: Keep `ENABLE_FIREFOX_PUBLISHING=false` until Mozilla approves your first submission. This prevents duplicate submissions while still including Firefox builds in GitHub releases.

## Current Behavior

### Without Firefox Secrets

- ✅ Chrome build and upload works normally
- ⚠️ Firefox publishing is **skipped with a warning**
- ✅ GitHub release still created with both zip files
- ✅ Workflow succeeds (doesn't fail)

**This means you can push these changes immediately!**

### With Firefox Secrets

- ✅ Chrome: Uploaded as draft to Chrome Web Store
- ✅ Firefox: Uploaded to Mozilla Add-ons for review
- ✅ GitHub Release: Created with both Chrome and Firefox zips
- ℹ️ Mozilla will review (usually 1-2 days)

## Quick Reference

### GitHub Secrets Needed:
- `FIREFOX_API_KEY` - JWT issuer from Mozilla
- `FIREFOX_API_SECRET` - JWT secret from Mozilla

### GitHub Variables Needed:
- `FIREFOX_EXTENSION_ID` - Your add-on ID

### Workflows:
- `.github/workflows/release.yml` - Full release on push to main
- `.github/workflows/build-artifacts.yml` - Manual build (no release)

### Documentation:
- `docs/FIREFOX_SETUP.md` - Detailed setup instructions
- This file - Quick start guide

## Next Steps

1. ✅ These changes are ready to commit
2. ⏳ Do the manual Firefox upload (Step 1 above)
3. ⏳ Generate API credentials (Step 2 above)
4. ⏳ Configure GitHub secrets (Step 3 above)
5. 🎉 Test with the manual build workflow

---

**Questions?** Check `docs/FIREFOX_SETUP.md` for detailed instructions and troubleshooting.
