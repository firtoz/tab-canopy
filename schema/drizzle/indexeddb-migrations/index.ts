import type { Migration } from "@firtoz/drizzle-indexeddb";

import { migrate_0000 } from './0000_silent_revanche';

export const migrations: Migration[] = [
	migrate_0000
];

export default migrations;
