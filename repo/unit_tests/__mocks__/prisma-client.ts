/**
 * Thin mock for @prisma/client used only during unit tests.
 *
 * Several source files import Role, Prisma.sql/join, and PrismaClient
 * directly from '@prisma/client'.  When the real module is loaded it attempts
 * to lazy-init its native query-engine binary, which throws an unhandled
 * rejection inside containers where libssl version mismatches occur.
 *
 * vitest.unit.config.ts aliases '@prisma/client' → this file so the binary
 * is never required.  Individual tests that need the prisma singleton continue
 * to use vi.mock('@/lib/prisma', ...) as before.
 */

// Role enum — keep in sync with backend/prisma/schema.prisma
export enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  INVENTORY_CLERK = 'INVENTORY_CLERK',
  FRONT_DESK = 'FRONT_DESK',
  HOST = 'HOST',
  GUEST = 'GUEST',
  MODERATOR = 'MODERATOR',
}

// Prisma namespace — only the tagged-template helpers used in source files
export const Prisma = {
  sql: (strings: TemplateStringsArray, ...values: unknown[]) =>
    ({ strings, values, __type: 'sql' } as unknown),
  join: (fragments: unknown[], _separator?: unknown) =>
    ({ fragments, __type: 'join' } as unknown),
  // Stub out anything else source files reference at type level
  Sql: class {},
};

// PrismaClient — never instantiated in unit tests (the singleton is mocked),
// but providing the class prevents "not a constructor" errors if somehow
// the class is referenced at runtime.
export class PrismaClient {
  constructor(_opts?: unknown) {}
}
