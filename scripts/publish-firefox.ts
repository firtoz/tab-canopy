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
	console.log(`   Extension ID to inject: ${extensionId}`);
	console.log(
		`   Current env FIREFOX_EXTENSION_ID: ${process.env.FIREFOX_EXTENSION_ID || "(not set)"}`,
	);

	// Build the extension (web-ext sign needs the source directory, not a zip)
	// Use Bun.spawn with explicit env to ensure FIREFOX_EXTENSION_ID is passed
	// Turbo will automatically invalidate cache when FIREFOX_EXTENSION_ID changes (see turbo.json)
	const buildEnv = {
		...process.env,
		FIREFOX_EXTENSION_ID: extensionId,
	};

	console.log("   Building with environment:");
	console.log(`     - FIREFOX_EXTENSION_ID: ${buildEnv.FIREFOX_EXTENSION_ID}`);
	console.log(
		`     - Turbo will use cache only if FIREFOX_EXTENSION_ID matches`,
	);

	const buildProc = Bun.spawn(["bun", "run", "build:firefox"], {
		cwd: rootDir,
		env: buildEnv,
		stdout: "inherit",
		stderr: "inherit",
	});

	const buildExitCode = await buildProc.exited;

	if (buildExitCode !== 0) {
		throw new Error("Failed to build Firefox extension");
	}

	console.log("✓ Build completed");

	// The build output directory
	const sourceDir = join(rootDir, "packages/extension/.output/firefox-mv2");

	// Verify the manifest has the extension ID (REQUIRED before submission)
	console.log("\n🔍 Validating manifest...");
	try {
		const manifestPath = join(sourceDir, "manifest.json");
		const manifestContent = await Bun.file(manifestPath).text();
		const manifest = JSON.parse(manifestContent);

		const manifestId = manifest.browser_specific_settings?.gecko?.id;

		if (manifestId === extensionId) {
			console.log(`✓ Extension ID verified in manifest: ${manifestId}`);
		} else {
			console.error("\n❌ VALIDATION FAILED: Extension ID not in manifest!");
			console.error(`   Expected: ${extensionId}`);
			console.error(`   Found: ${manifestId || "none"}`);
			console.error("\n   This would create a duplicate addon with a new ID.");
			console.error("   Aborting submission to prevent duplicate addons.");
			throw new Error(
				"Extension ID not found in manifest - build process failed to inject ID",
			);
		}
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("not found in manifest")
		) {
			throw error; // Re-throw our validation error
		}
		console.error(
			"❌ Could not verify manifest:",
			error instanceof Error ? error.message : String(error),
		);
		throw new Error("Failed to validate manifest before submission");
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
