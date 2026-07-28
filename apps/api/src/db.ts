import { PrismaClient } from "@prisma/client";

// Singleton: evita múltiples conexiones en dev (hot reload de tsx watch) y
// reutiliza el cliente entre invocaciones calientes de la misma instancia
// serverless en Vercel (una conexión por instancia, no por request).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalForPrisma.prisma = prisma;
