-- Migrate proxy_routes to the v2 schema (match + handlers).
-- Add the new columns, backfill via JSON functions, then drop the old ones.

ALTER TABLE `proxy_routes` ADD COLUMN `match` text(2048) DEFAULT '{"path":"/*"}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `proxy_routes` ADD COLUMN `handlers` text(16384) DEFAULT '[]' NOT NULL;
--> statement-breakpoint
UPDATE `proxy_routes`
SET
  `match` = json_object('path', `path_pattern`),
  `handlers` = (
    SELECT json_group_array(
      CASE
        WHEN json_extract(value, '$.type') IS NOT NULL THEN
          json_object(
            'type', json_extract(value, '$.type'),
            'options', (
              SELECT json_group_object(key, val)
              FROM (
                SELECT key, value AS val
                FROM json_each(value)
                WHERE key != 'type'
              )
            )
          )
        ELSE value
      END
    )
    FROM json_each(`middleware`)
  ) || ''
;
--> statement-breakpoint
-- json_group_array returns NULL for an empty array; reset to []
UPDATE `proxy_routes` SET `handlers` = '[]' WHERE `handlers` IS NULL OR `handlers` = '';
--> statement-breakpoint
-- Append the terminal handler derived from upstream_type/upstream_url/preserve_host.
UPDATE `proxy_routes`
SET `handlers` = json_insert(
  `handlers`,
  '$[#]',
  json(
    json_object(
      'type', CASE WHEN `upstream_type` = 'authhero' THEN 'http' ELSE `upstream_type` END,
      'options', json_object(
        'upstream_url', `upstream_url`,
        'preserve_host', `preserve_host` != 0
      )
    )
  )
);
--> statement-breakpoint
ALTER TABLE `proxy_routes` DROP COLUMN `path_pattern`;
--> statement-breakpoint
ALTER TABLE `proxy_routes` DROP COLUMN `upstream_type`;
--> statement-breakpoint
ALTER TABLE `proxy_routes` DROP COLUMN `upstream_url`;
--> statement-breakpoint
ALTER TABLE `proxy_routes` DROP COLUMN `preserve_host`;
--> statement-breakpoint
ALTER TABLE `proxy_routes` DROP COLUMN `middleware`;
