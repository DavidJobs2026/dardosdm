import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("🚫 Do not run seed against a production database!");
  }
  console.log("🌱 Seeding database...");

  const password = await bcrypt.hash("password123", 12);

  // Admin
  const admin = await prisma.user.upsert({
    where: { email: "admin@tournament.com" },
    update: {},
    create: { email: "admin@tournament.com", passwordHash: password, name: "Admin", role: "admin", elo: 1200 },
  });

  // Organizer
  const organizer = await prisma.user.upsert({
    where: { email: "organizer@tournament.com" },
    update: {},
    create: { email: "organizer@tournament.com", passwordHash: password, name: "Organizador", role: "organizer", elo: 1100 },
  });

  // Players
  const playerNames = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Hector"];
  const players = await Promise.all(
    playerNames.map((name, i) =>
      prisma.user.upsert({
        where: { email: `${name.toLowerCase()}@tournament.com` },
        update: {},
        create: {
          email: `${name.toLowerCase()}@tournament.com`,
          passwordHash: password,
          name,
          role: "player",
          elo: 1000 + i * 25,
        },
      })
    )
  );

  // Create player stats for everyone
  await Promise.all(
    [...players, organizer, admin].map((u) =>
      prisma.playerStats.upsert({
        where: { userId: u.id },
        update: {},
        create: { userId: u.id },
      })
    )
  );

  // Sample tournament
  const tournament = await prisma.tournament.create({
    data: {
      name: "Torneo de demostración",
      description: "Torneo de ejemplo con 8 participantes. Eliminación simple.",
      format: "single_elimination",
      status: "registration",
      maxParticipants: 8,
      participantType: "user",
      createdById: organizer.id,
    },
  });

  // Register all players
  await prisma.participant.createMany({
    data: players.map((p, i) => ({
      tournamentId: tournament.id,
      entityType: "user",
      userId: p.id,
      seed: i + 1,
    })),
  });

  console.log("✅ Seed complete!");
  console.log(`   Admin:     admin@tournament.com / password123`);
  console.log(`   Organizer: organizer@tournament.com / password123`);
  console.log(`   Players:   alice@tournament.com ... / password123`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
