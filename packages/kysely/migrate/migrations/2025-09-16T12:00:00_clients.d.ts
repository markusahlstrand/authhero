import { Database } from "../../src/db";
import { Kysely } from "kysely";
export declare function up(db: Kysely<Database>): Promise<void>;
export declare function down(db: Kysely<Database>): Promise<void>;
