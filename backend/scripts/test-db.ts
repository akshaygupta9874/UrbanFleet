// backend/scripts/test-db.ts
import { prisma } from "../src/db/client.js";

async function check() {
    const count = await prisma.user.count();
    console.log("✅ PostgreSQL is connected! Total users:", count);

    const users = await prisma.user.findMany({
        select: { id: true, email: true, roles: true },
    });
    console.table(users);

    await prisma.$disconnect();
    process.exit(0);
}

check();