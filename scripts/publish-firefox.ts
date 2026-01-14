#!/usr/bin/env bun
/**
 * Publish to Firefox Add-ons using web-ext sign
 * Uploads the extension to Mozilla Add-ons for review
 *
 * Documentation: https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-sign
 *
 * How it works:
 * - Reads the source directory (unpackaged extension files)
 * - Creates a zip internally and submits to Mozilla for signing
 * - Downloads the signed .xpi to artifacts-dir
 * - For listed extensions, submits to AMO for review
 */

import { join } from "node:path";
import { $ } from "bun";
import { writeAmoMetadata } from "./generate-amo-metadata";

const rootDir = join(import.meta.dir, "..");

export async function publishFirefox(): Promise<void> {
	// Check for required environment variables
	const apiKey = process.env.FIREFOX_API_KEY;
	const apiSecret = process.env.FIREFOX_API_SECRET;
	const extensionId = process.env.FIREFOX_EXTENSION_ID;

	if (!apiKey || !apiSecret) {
		console.log(
			"⚠️  Firefox API credentials not configured (FIREFOX_API_KEY, FIREFOX_API_SECRET)",
		);
		console.log("   Skipping Firefox publishing");
		console.log(
			"   See docs/FIREFOX_SETUP.md for instructions on setting up Firefox API credentials",
		);
		return;
	}

	if (!extensionId) {
		console.log(
			"⚠️  FIREFOX_EXTENSION_ID not set - skipping automated Firefox publishing",
		);
		console.log(
			"   This is required for automated releases to prevent duplicate submissions.",
		);
		console.log(
			"   After Mozilla approves your first manual submission, set FIREFOX_EXTENSION_ID",
		);
		console.log("   See FIREFOX_RELEASE_SETUP.md for instructions");
		return;
	}

	console.log("📦 Building extension for Firefox...");
	console.log(`   Using extension ID: ${extensionId}`);

	// Build the extension (web-ext sign needs the source directory, not a zip)
	// Pass FIREFOX_EXTENSION_ID directly in the command
	const buildProc =
		await $`FIREFOX_EXTENSION_ID=${extensionId} bun run build:firefox`
			.cwd(rootDir)
			.nothrow();

	if (buildProc.exitCode !== 0) {
		throw new Error("Failed to build Firefox extension");
	}

	// The build output directory
	const sourceDir = join(rootDir, "packages/extension/.output/firefox-mv2");

	// Verify the manifest has the extension ID
	try {
		const manifestPath = join(sourceDir, "manifest.json");
		const manifestContent = await Bun.file(manifestPath).text();
		const manifest = JSON.parse(manifestContent);

		if (manifest.browser_specific_settings?.gecko?.id === extensionId) {
			console.log(
				`✓ Extension ID verified in manifest: ${manifest.browser_specific_settings.gecko.id}`,
			);
		} else {
			console.warn(`⚠️  WARNING: Extension ID not found in manifest!`);
			console.warn(`   Expected: ${extensionId}`);
			console.warn(
				`   Found: ${manifest.browser_specific_settings?.gecko?.id || "none"}`,
			);
		}
	} catch (error) {
		console.warn(
			"⚠️  Could not verify manifest:",
			error instanceof Error ? error.message : String(error),
		);
	}

	// Generate AMO metadata from Chrome store descriptions (single source of truth)
	console.log("\n📝 Generating AMO metadata...");
	const amoMetadataPath = await writeAmoMetadata();
	console.log(`   Generated: ${amoMetadataPath}`);

	console.log("\n🦊 Uploading to Firefox Add-ons...");

	console.log(`Using source directory: ${sourceDir}`);

	// Prepare web-ext sign command
	const submitArgs = [
		"bunx",
		"web-ext",
		"sign",
		"--source-dir",
		sourceDir,
		"--api-key",
		apiKey,
		"--api-secret",
		apiSecret,
		"--channel",
		"listed",
		"--artifacts-dir",
		join(rootDir, "packages/extension/.output"),
		"--amo-metadata",
		amoMetadataPath,
	];

	// Extension ID is set in the manifest.json via browser_specific_settings.gecko.id
	// during the build process (see wxt.config.ts) - no need to pass it here
	// AMO metadata is generated from store-metadata/chrome/* for consistency

	// Submit to Mozilla Add-ons
	const submitProc = await $`${submitArgs}`.cwd(rootDir).nothrow();

	if (submitProc.exitCode !== 0) {
		console.error("\n❌ Firefox Add-ons submission failed");
		console.error(submitProc.stderr.toString());
		throw new Error("Failed to submit to Firefox Add-ons");
	}

	console.log("\n✅ Extension uploaded to Firefox Add-ons");
	console.log("📋 Mozilla will review the submission");
	console.log("   Check status at: https://addons.mozilla.org/developers/");

	if (!extensionId) {
		console.log(
			"\n💡 Remember to set FIREFOX_EXTENSION_ID after the first approval!",
		);
	}

	// Now create the zip for the GitHub release
	console.log("\n📦 Creating Firefox zip for GitHub release...");
	const zipProc = await $`bun run zip:firefox`.cwd(rootDir).nothrow();

	if (zipProc.exitCode !== 0) {
		console.warn("⚠️  Failed to create Firefox zip for GitHub release");
	}
}

// Run if executed directly
if (import.meta.main) {
	try {
		await publishFirefox();
	} catch (error) {
		console.error("❌", error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
