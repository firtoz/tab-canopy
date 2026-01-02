import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// ES module equivalent of __dirname (Playwright runs in Node.js, not Bun)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use dev mode if E2E_DEV is set
const isDev = process.env.E2E_DEV === "true";
const buildDir = isDev ? "chrome-mv3-dev" : "chrome-mv3";

// Path to the built extension
const extensionPath = path.join(
	__dirname,
	"..",
	"extension",
	".output",
	buildDir,
);

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false, // Extensions don't work well with parallel tests
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1, // Single worker for extension testing
	reporter: "html",
	timeout: 30000,

	use: {
		trace: "on-first-retry",
	},

	// In dev mode, wait for WXT dev server on port 3000
	...(isDev && {
		webServer: {
			command: "bun run dev --port 3003",
			// url: "http://localhost:3003",
			reuseExistingServer: true, // Use existing server if already running
			timeout: 120000, // 2 minutes for initial build
			cwd: path.join(__dirname, "..", "extension"),
			stdout: "pipe",
			stderr: "pipe",
			port: 3003,
		},
	}),

	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				// Launch Chrome with the extension loaded
				launchOptions: {
					args: [
						`--disable-extensions-except=${extensionPath}`,
						`--load-extension=${extensionPath}`,
						"--disable-features=GlobalShortcutsPortal",
						"--no-first-run",
						"--disable-infobars",
					],
				},
			},
		},
	],

	// Note: Build is handled by Turborepo (turbo.json ensures build runs before test:e2e)
	// The fixtures will wait for manifest.json to exist if build hasn't completed yet
});
