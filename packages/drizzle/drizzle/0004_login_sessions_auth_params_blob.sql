-- Move login_sessions.authParams into a JSON blob column `auth_params`
-- and drop the legacy hoisted authParams_* columns. Matches the kysely
-- adapter migrations 2026-04-20T10:00 / 11:00 / 12:00.

-- 1. Add the blob column.
ALTER TABLE `login_sessions` ADD `auth_params` text;--> statement-breakpoint

-- 2. Backfill `auth_params` from the hoisted columns for legacy rows.
--    json_object includes null values; json_remove with a conditional path
--    strips keys whose hoisted column was NULL. Non-existent paths (the
--    `$.__nxN` dummies) are silently ignored by json_remove.
UPDATE `login_sessions`
SET `auth_params` = json_remove(
  json_object(
    'client_id',             `authParams_client_id`,
    'act_as',                `authParams_act_as`,
    'response_type',         `authParams_response_type`,
    'response_mode',         `authParams_response_mode`,
    'redirect_uri',          `authParams_redirect_uri`,
    'audience',              `authParams_audience`,
    'organization',          `authParams_organization`,
    'state',                 `authParams_state`,
    'nonce',                 `authParams_nonce`,
    'scope',                 `authParams_scope`,
    'prompt',                `authParams_prompt`,
    'code_challenge_method', `authParams_code_challenge_method`,
    'code_challenge',        `authParams_code_challenge`,
    'username',              `authParams_username`,
    'ui_locales',            `authParams_ui_locales`,
    'vendor_id',             `authParams_vendor_id`
  ),
  CASE WHEN `authParams_act_as`                IS NULL THEN '$.act_as'                ELSE '$.__nx1'  END,
  CASE WHEN `authParams_response_type`         IS NULL THEN '$.response_type'         ELSE '$.__nx2'  END,
  CASE WHEN `authParams_response_mode`         IS NULL THEN '$.response_mode'         ELSE '$.__nx3'  END,
  CASE WHEN `authParams_redirect_uri`          IS NULL THEN '$.redirect_uri'          ELSE '$.__nx4'  END,
  CASE WHEN `authParams_audience`              IS NULL THEN '$.audience'              ELSE '$.__nx5'  END,
  CASE WHEN `authParams_organization`          IS NULL THEN '$.organization'          ELSE '$.__nx6'  END,
  CASE WHEN `authParams_state`                 IS NULL THEN '$.state'                 ELSE '$.__nx7'  END,
  CASE WHEN `authParams_nonce`                 IS NULL THEN '$.nonce'                 ELSE '$.__nx8'  END,
  CASE WHEN `authParams_scope`                 IS NULL THEN '$.scope'                 ELSE '$.__nx9'  END,
  CASE WHEN `authParams_prompt`                IS NULL THEN '$.prompt'                ELSE '$.__nx10' END,
  CASE WHEN `authParams_code_challenge_method` IS NULL THEN '$.code_challenge_method' ELSE '$.__nx11' END,
  CASE WHEN `authParams_code_challenge`        IS NULL THEN '$.code_challenge'        ELSE '$.__nx12' END,
  CASE WHEN `authParams_username`              IS NULL THEN '$.username'              ELSE '$.__nx13' END,
  CASE WHEN `authParams_ui_locales`            IS NULL THEN '$.ui_locales'            ELSE '$.__nx14' END,
  CASE WHEN `authParams_vendor_id`             IS NULL THEN '$.vendor_id'             ELSE '$.__nx15' END
)
WHERE `auth_params` IS NULL;--> statement-breakpoint

-- 3. Drop the hoisted columns. No foreign key exists on authParams_client_id
--    in the drizzle/D1 schema, so plain DROP COLUMN works on SQLite 3.35+.
ALTER TABLE `login_sessions` DROP COLUMN `authParams_client_id`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_vendor_id`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_username`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_response_type`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_response_mode`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_audience`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_scope`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_state`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_nonce`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_code_challenge_method`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_code_challenge`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_redirect_uri`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_organization`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_prompt`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_act_as`;--> statement-breakpoint
ALTER TABLE `login_sessions` DROP COLUMN `authParams_ui_locales`;
