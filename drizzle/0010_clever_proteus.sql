ALTER TABLE "phone_verifications" ALTER COLUMN "code_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "phone_verifications" ALTER COLUMN "code_salt" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "phone_verifications" ADD COLUMN "provider" text DEFAULT 'local' NOT NULL;