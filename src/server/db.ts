import "server-only";
import { createDatabase } from "./client";
import { createRuntimeDatabase } from "./runtime-db";
import { getRuntimeSettings } from "./runtime-settings";

const globalDb = globalThis as unknown as {
  eduonDb?: ReturnType<typeof createDatabase>;
  eduonDbUrl?: string;
  eduonDbFailedUrl?: string;
};

export function isUsingRuntimeDatabase(): boolean {
  const isTestEnv =
    process.env.NODE_ENV === "test" || process.env.E2E_TEST_MODE === "1";
  if (isTestEnv && process.env.DATABASE_URL) return false;
  const adminDbUrl = getRuntimeSettings().databaseUrl;
  if (!adminDbUrl || globalDb.eduonDbFailedUrl === adminDbUrl) return true;
  return false;
}

function createFailoverDatabase(
  pgClient: ReturnType<typeof createDatabase>,
  url: string,
): ReturnType<typeof createDatabase> {
  const runtimeClient = createRuntimeDatabase() as Record<string, unknown>;
  return new Proxy(pgClient as unknown as Record<string, unknown>, {
    get(target, prop: string) {
      if (globalDb.eduonDbFailedUrl === url) {
        return runtimeClient[prop];
      }
      const val = target[prop];
      if (typeof val === "function") {
        return async (...args: unknown[]) => {
          try {
            return await (val as (...a: unknown[]) => Promise<unknown>).apply(
              target,
              args,
            );
          } catch {
            globalDb.eduonDbFailedUrl = url;
            const fbFn = runtimeClient[prop] as (
              ...a: unknown[]
            ) => Promise<unknown>;
            return fbFn.apply(runtimeClient, args);
          }
        };
      }
      if (val && typeof val === "object" && prop in runtimeClient) {
        const runtimeModel = runtimeClient[prop] as Record<string, unknown>;
        return new Proxy(val as Record<string, unknown>, {
          get(modelTarget, methodProp: string) {
            if (globalDb.eduonDbFailedUrl === url) {
              return runtimeModel[methodProp];
            }
            const methodVal = modelTarget[methodProp];
            if (typeof methodVal === "function") {
              return async (...args: unknown[]) => {
                try {
                  return await (
                    methodVal as (...a: unknown[]) => Promise<unknown>
                  ).apply(modelTarget, args);
                } catch {
                  globalDb.eduonDbFailedUrl = url;
                  const fbMethod = runtimeModel[methodProp] as (
                    ...a: unknown[]
                  ) => Promise<unknown>;
                  return fbMethod.apply(runtimeModel, args);
                }
              };
            }
            return methodVal;
          },
        });
      }
      return val;
    },
  }) as unknown as ReturnType<typeof createDatabase>;
}

export function getDatabase(): ReturnType<typeof createDatabase> {
  const isTestEnv =
    process.env.NODE_ENV === "test" || process.env.E2E_TEST_MODE === "1";
  if (isTestEnv && process.env.DATABASE_URL) {
    const testUrl = process.env.DATABASE_URL;
    if (!globalDb.eduonDb || globalDb.eduonDbUrl !== testUrl) {
      globalDb.eduonDb = createDatabase(testUrl);
      globalDb.eduonDbUrl = testUrl;
    }
    return globalDb.eduonDb;
  }

  const adminDbUrl = getRuntimeSettings().databaseUrl;
  if (adminDbUrl && globalDb.eduonDbFailedUrl !== adminDbUrl) {
    if (!globalDb.eduonDb || globalDb.eduonDbUrl !== adminDbUrl) {
      globalDb.eduonDb = createFailoverDatabase(
        createDatabase(adminDbUrl),
        adminDbUrl,
      );
      globalDb.eduonDbUrl = adminDbUrl;
    }
    return globalDb.eduonDb;
  }

  return createRuntimeDatabase() as unknown as ReturnType<typeof createDatabase>;
}
