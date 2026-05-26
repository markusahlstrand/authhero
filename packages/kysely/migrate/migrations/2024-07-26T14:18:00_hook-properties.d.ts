import { Kysely } from "kysely";
import { Database } from "../../src/db";
export declare function up(_: Kysely<Database>): Promise<void>;
export declare function down(_: Kysely<Database>): Promise<void>;
