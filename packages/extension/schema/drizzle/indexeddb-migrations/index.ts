import type { Migration } from "@firtoz/drizzle-indexeddb";

import { migrate_0000 } from "./0000_silent_revanche";
import { migrate_0001 } from "./0001_overconfident_secret_warriors";

export const migrations: Migration[] = [migrate_0000, migrate_0001];

export default migrations;
