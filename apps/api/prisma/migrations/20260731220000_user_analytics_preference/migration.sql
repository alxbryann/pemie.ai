-- Preferencia de analítica de producto (PEM-8): un solo booleano en `users`,
-- default ON (analítica de primera parte, sin session replay ni feature flags).
ALTER TABLE "users" ADD COLUMN     "analyticsEnabled" BOOLEAN NOT NULL DEFAULT true;
