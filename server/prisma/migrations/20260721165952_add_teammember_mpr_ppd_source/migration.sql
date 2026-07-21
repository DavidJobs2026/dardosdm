-- Store raw MPR/PPD and the provenance per team member, so the organizer can review and adjust each player metric at approval time.
ALTER TABLE "team_members" ADD COLUMN "mpr" DOUBLE PRECISION;
ALTER TABLE "team_members" ADD COLUMN "ppd" DOUBLE PRECISION;
ALTER TABLE "team_members" ADD COLUMN "metric_source" TEXT;
