import { Kysely } from "kysely";
/**
 * Add authParams_max_age and authParams_acr_values columns to login_sessions table
 * This is needed for OIDC Core 3.1.2.1 max_age and acr_values parameter support
 */
export declare function up(db: Kysely<any>): Promise<void>;
export declare function down(db: Kysely<any>): Promise<void>;
