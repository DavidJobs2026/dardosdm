import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL!;
  const password = process.env.ADMIN_PASSWORD!;

  if (!email || !password) {
    console.error("❌ Falta ADMIN_EMAIL o ADMIN_PASSWORD");
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("❌ ADMIN_PASSWORD debe tener al menos 12 caracteres");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, role: "admin", emailVerified: true },
    create: {
      email,
      passwordHash: hash,
      name: "Admin",
      role: "admin",
      emailVerified: true,
      elo: 1200,
      gdprConsent: true,
    },
  });

  console.log("✅ Admin listo:", user.email, "| role:", user.role);
}

main().catch(console.error).finally(() => prisma.$disconnect());
