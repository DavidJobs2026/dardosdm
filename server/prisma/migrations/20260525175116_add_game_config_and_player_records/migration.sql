-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "game_type" TEXT,
ADD COLUMN     "metric" TEXT;

-- CreateTable
CREATE TABLE "tournament_levels" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min_value" DOUBLE PRECISION NOT NULL,
    "max_value" DOUBLE PRECISION,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_records" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dni" TEXT,
    "card_number" TEXT,
    "team_name" TEXT,
    "grupo" TEXT,
    "stage_name" TEXT,
    "season" TEXT NOT NULL,
    "game_type" TEXT NOT NULL,
    "ppd" DOUBLE PRECISION,
    "mpr" DOUBLE PRECISION,
    "games_played" INTEGER,
    "combined" DOUBLE PRECISION,
    "level" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_records_name_idx" ON "player_records"("name");

-- CreateIndex
CREATE INDEX "player_records_dni_idx" ON "player_records"("dni");

-- CreateIndex
CREATE INDEX "player_records_season_game_type_idx" ON "player_records"("season", "game_type");

-- AddForeignKey
ALTER TABLE "tournament_levels" ADD CONSTRAINT "tournament_levels_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
