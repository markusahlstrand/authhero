import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Adds fields needed by the `/authorize/resume` endpoint so that terminal
 * sub-flows (social callback, UL password, OTP, etc.) can persist the
 * authentication strategy/connection metadata onto the login session and
 * let a single endpoint finalize the response on the correct domain.
 */
export declare function up(db: Kysely<Database>): Promise<void>;
export declare function down(db: Kysely<Database>): Promise<void>;
