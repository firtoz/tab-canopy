#!/usr/bin/env bun
/**
 * Publish to Firefox Add-ons (stub for future implementation)
 */

export async function publishFirefox(): Promise<void> {
	console.log("🦊 Firefox publishing not yet implemented");
	console.log("📋 TODO: Set up Firefox Add-ons publishing");
	console.log("   See docs/PUBLISHING.md for setup instructions");

	// For now, don't throw to not block the release process
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
