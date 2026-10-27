import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

let db: Db | null = null;

export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    const pool = new pg.Pool({ connectionString: url, max: 2, ssl: local ? undefined : { rejectUnauthorized: true } });
    db = drizzle(pool, { schema });
  }
  return db;
}
