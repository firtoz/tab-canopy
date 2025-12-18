import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

console.log("EXT_NAME", import.meta.env.EXT_NAME);

// See https://wxt.dev/api/config.html
export default defineConfig({
	modules: ["@wxt-dev/module-react"],
	vite: () => ({
		plugins: [tailwindcss()],
	}),
	manifest: ({ command }) => ({
		permissions: ["tabs", "sidePanel"],
		name: import.meta.env.EXT_NAME ?? "Tab Canopy",
		icons: {
			16: command === "serve" ? "/icon-dev/16.png" : "/icon/16.png",
			32: command === "serve" ? "/icon-dev/32.png" : "/icon/32.png",
			48: command === "serve" ? "/icon-dev/48.png" : "/icon/48.png",
			96: command === "serve" ? "/icon-dev/96.png" : "/icon/96.png",
			128: command === "serve" ? "/icon-dev/128.png" : "/icon/128.png",
		},
	}),
});
