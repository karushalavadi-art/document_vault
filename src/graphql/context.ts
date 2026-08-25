import type { PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export interface GraphQLContext {
  prisma: PrismaClient;
}

export function createContext(): GraphQLContext {
  return { prisma };
}
