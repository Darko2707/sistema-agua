CREATE INDEX "idx_cortes_perfil_activo" ON "cortes" USING btree ("perfil_id","activo");--> statement-breakpoint
CREATE INDEX "idx_session_user_id" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier");