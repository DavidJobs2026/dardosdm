-- CreateTable
CREATE TABLE "tournament_referees" (
    "id"           TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "user_id"       TEXT NOT NULL,
    "diana_start"   INTEGER,
    "diana_end"     INTEGER,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_referees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tournament_referees_tournament_id_user_id_key"
    ON "tournament_referees"("tournament_id", "user_id");

-- AddForeignKey
ALTER TABLE "tournament_referees"
    ADD CONSTRAINT "tournament_referees_tournament_id_fkey"
    FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_referees"
    ADD CONSTRAINT "tournament_referees_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
