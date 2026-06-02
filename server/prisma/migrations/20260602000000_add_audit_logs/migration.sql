CREATE TABLE "audit_logs" (
    "id"          TEXT NOT NULL,
    "user_id"     TEXT NOT NULL,
    "action"      TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id"   TEXT,
    "entity_name" TEXT,
    "details"     JSONB,
    "ip"          TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "audit_logs_user_id_idx"   ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_action_idx"    ON "audit_logs"("action");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
