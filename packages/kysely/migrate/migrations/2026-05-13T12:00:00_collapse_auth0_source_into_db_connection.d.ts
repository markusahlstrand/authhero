import { Kysely } from "kysely";
import { Database } from "../../src/db";
export declare function up(db: Kysely<Database>): Promise<void>;
export declare function down(): Promise<void>;
