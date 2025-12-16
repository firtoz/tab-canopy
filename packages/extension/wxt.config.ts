import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

console.log("EXT_NAME", import.meta.env.EXT_NAME);

// See https://wxt.dev/api/config.html
export default defineConfig({
	modules: ["@wxt-dev/module-react"],
	vite: () => ({
		plugins: [tailwindcss()],
	}),
	manifest: {
		permissions: ["tabs", "sidePanel"],
		name: import.meta.env.EXT_NAME ?? "Tab Canopy",
	},
});
