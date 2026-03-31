import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

let sqlClient: ReturnType<typeof postgres> | undefined;
let dbInstance: DbInstance | undefined;

function getOrCreateDb(): DbInstance {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!dbInstance) {
    sqlClient = postgres(url, { prepare: false });
    dbInstance = drizzle(sqlClient, { schema });
  }
  return dbInstance;
}

/**
 * Drizzle database client. Connection is created lazily on first use so that
 * importing this module during `next build` does not require `DATABASE_URL`.
 */
export const db = new Proxy({} as DbInstance, {
  get(_target, prop, receiver) {
    return Reflect.get(getOrCreateDb() as object, prop, receiver);
  },
});
