CREATE TABLE `tenant_operation_rows` (
	`operation_id` text(255) NOT NULL,
	`seq` integer NOT NULL,
	`payload` text NOT NULL,
	`status` text(32) NOT NULL,
	`error_code` text(64),
	`error_message` text,
	`error_path` text(255),
	`entity_id` text(255),
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	PRIMARY KEY(`operation_id`, `seq`),
	FOREIGN KEY (`operation_id`) REFERENCES `tenant_operations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tenant_operation_rows_operation_id_status_idx` ON `tenant_operation_rows` (`operation_id`,`status`);--> statement-breakpoint
ALTER TABLE `tenant_operations` ADD `input` text;--> statement-breakpoint
ALTER TABLE `tenant_operations` ADD `result` text;--> statement-breakpoint
ALTER TABLE `tenant_operations` ADD `claimed_by` text(255);--> statement-breakpoint
ALTER TABLE `tenant_operations` ADD `claim_expires_at` text(35);