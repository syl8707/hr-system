import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/app/generated/prisma/client";

// Prisma 7 ships without the Rust query engine: the client connects through a
// JS driver adapter. `@prisma/adapter-pg` works with any standard PostgreSQL
// connection string, including Neon.
const connectionString = process.env.DATABASE_URL;

// Cache both the pg pool and the Prisma client on `globalThis`. In dev,
// Turbopack re-evaluates modules on hot reload (and can do so per route
// segment); without this guard each evaluation would open a brand-new pool,
// churning short-lived TCP connections to the database until the host runs
// out of ephemeral ports (EADDRINUSE).
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

function createPool() {
  return new Pool({
    connectionString,
    // Keep idle connections warm and reused instead of reconnecting per query.
    keepAlive: true,
    // Bound concurrency — Neon (and its pooler) prefer a small client pool.
    max: 5,
    // Hold idle connections for a while so sparse traffic reuses them.
    idleTimeoutMillis: 30_000,
  });
}

function createPrismaClient(pool: Pool) {
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

const pool = globalForPrisma.pgPool ?? createPool();
export const prisma = globalForPrisma.prisma ?? createPrismaClient(pool);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.pgPool = pool;
  globalForPrisma.prisma = prisma;
}
