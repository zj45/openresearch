ALTER TABLE `atom` ADD `atom_claim_path` text;--> statement-breakpoint
ALTER TABLE `atom` ADD `atom_evidence_type` text NOT NULL;--> statement-breakpoint
ALTER TABLE `atom` ADD `atom_experiments_plan_path` text;--> statement-breakpoint
ALTER TABLE `atom` ADD `atom_evidence_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `atom` ADD `atom_evidence_path` text;--> statement-breakpoint
ALTER TABLE `atom` DROP COLUMN `atom_content_path`;--> statement-breakpoint
ALTER TABLE `atom` DROP COLUMN `atom_proof_type`;--> statement-breakpoint
ALTER TABLE `atom` DROP COLUMN `atom_proof_plan_path`;--> statement-breakpoint
ALTER TABLE `atom` DROP COLUMN `atom_proof_status`;--> statement-breakpoint
ALTER TABLE `atom` DROP COLUMN `atom_proof_result_path`;