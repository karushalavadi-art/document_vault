import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient instance across the process (and across
// hot-reloads in --watch mode) instead of opening a new connection pool
// per import.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
