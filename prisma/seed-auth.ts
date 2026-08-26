import "dotenv/config";
import { seedAuthUsers } from "../src/lib/auth/seed-users";
import { prisma } from "../src/lib/prisma";

seedAuthUsers()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
