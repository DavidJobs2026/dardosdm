-- CreateTable
CREATE TABLE "tournament_co_organizers" (
    "id"            TEXT        NOT NULL,
    "tournament_id" TEXT        NOT NULL,
    "user_id"       TEXT        NOT NULL,
    "granted_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_co_organizers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tournament_co_organizers_tournament_id_user_id_key"
    ON "tournament_co_organizers"("tournament_id", "user_id");

-- AddForeignKey
ALTER TABLE "tournament_co_organizers"
    ADD CONSTRAINT "tournament_co_organizers_tournament_id_fkey"
    FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_co_organizers"
    ADD CONSTRAINT "tournament_co_organizers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
