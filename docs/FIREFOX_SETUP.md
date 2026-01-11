# Firefox Add-ons API Setup

This guide will walk you through setting up automated Firefox Add-ons publishing via GitHub Actions.

## Overview

The extension already builds Firefox versions automatically. To enable automated publishing to Firefox Add-ons, you need to:

1. Manually upload the extension to Firefox Add-ons for the first time
2. Generate API credentials from Mozilla
3. Configure GitHub secrets and variables

## Prerequisites

- A Firefox account at [addons.mozilla.org](https://addons.mozilla.org/)
- Your extension built: `bun run zip:firefox`

## Step 1: Initial Manual Upload

Before automated publishing can work, you need to manually create your add-on listing on Firefox Add-ons.

1. **Build the Firefox extension:**
   ```bash
   bun run zip:firefox
   ```
   This creates `packages/extension/.output/*-firefox.zip`

2. **Go to Firefox Add-on Developer Hub:**
   - Visit: [https://addons.mozilla.org/developers/](https://addons.mozilla.org/developers/)
   - Sign in with your Firefox account

3. **Submit a New Add-on:**
   - Click **"Submit a New Add-on"**
   - Choose **"On this site"** (for listed add-ons) or **"On your own"** (for self-distribution)
   - Upload the `.output/*-firefox.zip` file

4. **Fill in the listing information:**
   - Add-on name: `Tab Canopy`
   - Description: Use content from `store-metadata/firefox/description.md`
   - Categories: Choose relevant categories (e.g., Tabs, Privacy)
   - Screenshots: Upload from `store-metadata/firefox/screenshots/`
   - Privacy policy: (if applicable)

5. **Submit for review:**
   - Click **"Submit Version"**
   - Mozilla will review your add-on (typically 1-2 days for initial review)

6. **Note your Add-on ID:**
   - After submission, go to your add-on's page
   - The URL will be: `https://addons.mozilla.org/en-US/developers/addon/YOUR-ADDON-ID/`
   - Save this `YOUR-ADDON-ID` - you'll need it for GitHub configuration

   Alternatively, your add-on may have a UUID like `{12345678-1234-1234-1234-123456789012}`. You can find this in your add-on's details page or in the `manifest.json` after the first upload.

## Step 2: Generate API Credentials

Once your add-on is approved (or even while it's in review), generate API credentials:

1. **Go to API Credentials page:**
   - Visit: [https://addons.mozilla.org/en-US/developers/addon/api/key/](https://addons.mozilla.org/en-US/developers/addon/api/key/)
   - Or: From your Developer Hub → Account → API Credentials

2. **Generate new credentials:**
   - Click **"Generate new credentials"**
   - Name: `GitHub Actions CI/CD` (or any descriptive name)
   - Click **"Generate credentials"**

3. **Save the credentials securely:**
   - **JWT issuer** (also called "API key"): A string like `user:12345:67`
   - **JWT secret**: A long random string
   
   ⚠️ **Important:** Save these immediately! The secret is only shown once.

## Step 3: Configure GitHub

Now configure your GitHub repository with the Firefox credentials.

### Add GitHub Secrets

Go to your GitHub repository:
- **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these two secrets:

1. **`FIREFOX_API_KEY`**
   - Value: Your JWT issuer (e.g., `user:12345:67`)

2. **`FIREFOX_API_SECRET`**
   - Value: Your JWT secret

### Add GitHub Variable

Still in **Settings** → **Secrets and variables** → **Actions**, but switch to the **Variables** tab:

1. **`FIREFOX_EXTENSION_ID`**
   - Value: Your add-on ID (e.g., `tab-canopy` or `{12345678-1234-1234-1234-123456789012}`)

## Step 4: Test the Workflow

Once everything is configured, test the automated publishing:

### Option 1: Push to Main (Full Release)

If you have changesets ready:

```bash
git push origin main
```

The release workflow will:
- Build both Chrome and Firefox versions
- Upload Chrome to Chrome Web Store as draft
- Upload Firefox to Mozilla Add-ons for review
- Create a GitHub release with both zip files

### Option 2: Manual Artifact Build (No Release)

To just build artifacts without releasing:

1. Go to your GitHub repository
2. Navigate to **Actions** → **Build Extension Artifacts**
3. Click **"Run workflow"**
4. Select which browsers to build (Chrome, Firefox, or both)
5. Click **"Run workflow"**
6. Once complete, download the artifacts from the workflow run

## Workflow Behavior

### When Secrets Are Missing

The workflow is designed to be **inert** when Firefox secrets are not configured:

- ✅ Chrome build and upload proceeds normally
- ⚠️ Firefox publishing is skipped with a warning message
- ✅ GitHub release is still created with both zip files
- ✅ Workflow succeeds (doesn't fail)

This means you can merge these changes immediately and configure Firefox credentials later.

### When Secrets Are Present

With all secrets configured:

- ✅ Chrome: Uploaded as draft to Chrome Web Store
- ✅ Firefox: Uploaded to Mozilla Add-ons for review
- ✅ GitHub Release: Created with both Chrome and Firefox zip files

## Manual Publishing

Even with automation set up, Mozilla will still review each submission. The process:

1. **Automated upload:** GitHub Actions uploads your new version
2. **Mozilla review:** Automated review (usually 1-2 days)
3. **Publication:** Automatically published if review passes

You can monitor the review status at:
- [https://addons.mozilla.org/developers/](https://addons.mozilla.org/developers/)
- You'll receive email notifications about review status

## Troubleshooting

### "Authentication failed"

- Check that `FIREFOX_API_KEY` and `FIREFOX_API_SECRET` are correct
- Verify credentials haven't been revoked at [https://addons.mozilla.org/developers/addon/api/key/](https://addons.mozilla.org/developers/addon/api/key/)

### "Add-on not found" or "Version already exists"

- Check that `FIREFOX_EXTENSION_ID` matches your add-on ID exactly
- If this is your first automated submission after manual upload, ensure the ID format is correct

### "Validation failed"

- The extension zip might not meet Firefox requirements
- Check the error message for specific issues
- Common issues:
  - Missing required manifest fields
  - Icon size requirements
  - Permission declarations

### Build fails on "web-ext"

- The workflow uses the `web-ext` tool for signing and uploading
- If it fails, check that `bun install` completed successfully
- Ensure the build output directory exists at `packages/extension/.output/firefox-mv2`

## Security Notes

⚠️ **Keep API credentials secure:**

- Never commit API keys/secrets to the repository
- Always use GitHub Secrets for sensitive data
- Rotate credentials if they're ever exposed
- Consider using environment-specific credentials (e.g., separate for staging)

## Additional Resources

- [Firefox Add-ons Documentation](https://extensionworkshop.com/)
- [Firefox Add-ons API Documentation](https://addons-server.readthedocs.io/en/latest/topics/api/signing.html)
- [web-ext Documentation](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
- [GitHub Actions Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)

## Summary Checklist

- [x] Build and zip extension: `bun run zip:firefox` (WXT automatically builds before zipping)
- [x] Manually upload to Firefox Add-ons
- [x] Generate API credentials
- [x] Add `FIREFOX_API_KEY` secret to GitHub
- [x] Add `FIREFOX_API_SECRET` secret to GitHub
- [x] Add `FIREFOX_EXTENSION_ID` variable to GitHub (`{ec31743e-031c-4eef-9115-4986f997dab3}`)
- [x] Add `ENABLE_FIREFOX_PUBLISHING` variable to GitHub (set to `false`)
- [ ] **⏳ Wait for initial approval from Mozilla** (usually 1-2 days)
- [ ] Once approved, enable automated publishing:
  ```bash
  gh variable set ENABLE_FIREFOX_PUBLISHING --body "true"
  ```
- [ ] Test automated releases by merging a Version Packages PR

---

**Need help?** Open an issue on the repository with details about your problem.
