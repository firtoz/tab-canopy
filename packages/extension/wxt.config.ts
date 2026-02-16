import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
	modules: ["@wxt-dev/module-react"],
	vite: () => ({
		plugins: [tailwindcss()],
	}),
	manifest: ({ command, browser }) => ({
		permissions: [
			"tabs",
			"alarms",
			// Chrome requires explicit sidePanel permission
			// Firefox doesn't recognize sidePanel, uses sidebar_action instead
			...(browser === "chrome" ? ["sidePanel"] : []),
		],
		name: import.meta.env.EXT_NAME ?? "Tab Canopy",
		icons: {
			16: command === "serve" ? "/icon-dev/16.png" : "/icon/16.png",
			32: command === "serve" ? "/icon-dev/32.png" : "/icon/32.png",
			48: command === "serve" ? "/icon-dev/48.png" : "/icon/48.png",
			96: command === "serve" ? "/icon-dev/96.png" : "/icon/96.png",
			128: command === "serve" ? "/icon-dev/128.png" : "/icon/128.png",
		},
		// Relax CSP for Firefox to allow the build artifacts
		// Firefox MV2 has stricter CSP than Chrome MV3
		...(browser === "firefox"
			? {
					content_security_policy:
						"script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
					browser_specific_settings: {
						gecko: {
							// Extension ID - can be set via FIREFOX_EXTENSION_ID env var
							// Leave undefined for initial submission, set for updates
							...(process.env.FIREFOX_EXTENSION_ID
								? { id: process.env.FIREFOX_EXTENSION_ID }
								: {}),
							// Data collection consent - required for all new Firefox extensions
							data_collection_permissions: {
								required: ["none"],
							},
						},
					},
				}
			: {}),
	}),
});
