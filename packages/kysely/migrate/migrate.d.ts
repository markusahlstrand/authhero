import { Kysely } from "kysely";
import { Database } from "../src/db";
export declare function migrateToLatest(db: Kysely<Database>, debug?: boolean): Promise<void>;
export declare function migrateDown(db: Kysely<Database>, debug?: boolean): Promise<void>;
