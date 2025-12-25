-- Add synced column to resource_servers table
ALTER TABLE `resource_servers` ADD COLUMN `synced` integer;
--> statement-breakpoint
-- Add synced column to roles table
ALTER TABLE `roles` ADD COLUMN `synced` integer;
--> statement-breakpoint
-- Add synced column to connections table
ALTER TABLE `connections` ADD COLUMN `synced` integer;
