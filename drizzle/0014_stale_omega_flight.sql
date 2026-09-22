ALTER TABLE "admins" ADD COLUMN "auth_user_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "auth_user_id" uuid;--> statement-breakpoint
ALTER TABLE "admins" ADD CONSTRAINT "admins_auth_user_id_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_auth_user_id_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admins_auth_user_id_key" ON "admins" USING btree ("auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_auth_user_id_key" ON "customers" USING btree ("auth_user_id");