-- Add per-member games count so the organizer can be warned when a player has fewer than the minimum games (e.g. 18) in a group inscription.
ALTER TABLE "team_members" ADD COLUMN "games_played" INTEGER;
