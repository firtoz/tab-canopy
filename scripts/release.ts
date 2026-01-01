#!/usr/bin/env bun
/**
 * Release script that publishes to browser extension stores
 * Adapted from fullstack-toolkit for Chrome/Firefox publishing
 */

import { publishChrome } from "./publish-chrome";
import { publishFirefox } from "./publish-firefox";

// Main release flow
let chromeSuccess = false;
let firefoxSuccess = false;

try {
	// Step 1: Publish to Chrome Web Store
	console.log("\n🚀 Publishing to Chrome Web Store...");
	try {
		await publishChrome();
		chromeSuccess = true;
	} catch (error) {
		console.error(
			"\n❌ Chrome publishing failed:",
			error instanceof Error ? error.message : String(error),
		);
	}

	// Step 2: Publish to Firefox Add-ons (stub for now)
	console.log("\n🦊 Publishing to Firefox Add-ons...");
	try {
		await publishFirefox();
		firefoxSuccess = true;
	} catch (error) {
		console.error(
			"\n⚠️  Firefox publishing failed (this is expected - not yet implemented):",
			error instanceof Error ? error.message : String(error),
		);
		// Don't fail the release if only Firefox fails
		firefoxSuccess = true;
	}
} finally {
	if (chromeSuccess && firefoxSuccess) {
		console.log("\n✅ Release complete!");
		console.log("💡 Extension uploaded as draft to Chrome Web Store");
		console.log("📝 Manually publish from the developer dashboard");
	} else {
		console.error("\n❌ Release failed!");
		process.exit(1);
	}
}
