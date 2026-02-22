import type { StandardSchemaV1 } from "@standard-schema/spec";
import { z } from "zod";
import type { Tab, Window } from "@/schema/src/schema";

/** Coerce date from Date, number (ms), or ISO string; null allowed for deletedAt */
const dateOrNull = z.union([z.coerce.date(), z.null()]);

const windowSchema = z.object({
	id: z.string().transform((s) => s as Window["id"]),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	deletedAt: dateOrNull,
	browserWindowId: z.number(),
	focused: z.boolean(),
	state: z.string().nullable(),
	incognito: z.boolean(),
	type: z.string().nullable(),
	isCollapsed: z.boolean().optional().default(false),
	titleOverride: z.string().nullable().optional().default(null),
});

const tabSchema = z.object({
	id: z.string().transform((s) => s as Tab["id"]),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	deletedAt: dateOrNull,
	browserTabId: z.number(),
	browserWindowId: z.number(),
	tabIndex: z.number(),
	parentTabId: z.number().nullable(),
	treeOrder: z.string(),
	isCollapsed: z.boolean().optional().default(false),
	title: z.string().nullable(),
	url: z.string().nullable(),
	favIconUrl: z.string().nullable(),
	titleOverride: z.string().nullable().optional().default(null),
	active: z.boolean(),
	pinned: z.boolean(),
	highlighted: z.boolean(),
	discarded: z.boolean(),
	frozen: z.boolean(),
	autoDiscardable: z.boolean(),
	audible: z.boolean(),
	mutedInfo: z.string().nullable(),
	status: z.string().nullable(),
	groupId: z.number().nullable(),
});

/**
 * Wrap a Zod schema as StandardSchemaV1 for use with @firtoz/db-helpers memoryCollectionOptions.
 */
function zodToStandardSchema<T>(
	schema: z.ZodType<T>,
): StandardSchemaV1<unknown, T> {
	return {
		"~standard": {
			version: 1,
			vendor: "zod",
			types: undefined as unknown as StandardSchemaV1.Props<
				unknown,
				T
			>["types"],
			validate(value: unknown) {
				const result = schema.safeParse(value);
				if (result.success) {
					return { value: result.data };
				}
				return {
					issues: result.error.issues.map((issue) => ({
						message: issue.message,
						path: issue.path as ReadonlyArray<PropertyKey>,
					})),
				};
			},
		},
	};
}

export const tabPassthroughSchema: StandardSchemaV1<unknown, Tab> =
	zodToStandardSchema(tabSchema as unknown as z.ZodType<Tab>);
export const windowPassthroughSchema: StandardSchemaV1<unknown, Window> =
	zodToStandardSchema(windowSchema as unknown as z.ZodType<Window>);
