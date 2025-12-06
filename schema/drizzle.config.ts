import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	driver: "durable-sqlite",
	schema: "./schema/src/schema.ts",
	out: "./schema/drizzle",
});
