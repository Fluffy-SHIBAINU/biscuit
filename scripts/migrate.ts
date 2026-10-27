import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "../server/db.js";

config({ path: ".env.local", override: true });
const url = new URL(process.env.DATABASE_URL!);
console.log(`migrating ${url.hostname}${url.pathname}`);
await migrate(getDb(), { migrationsFolder: "drizzle" });
console.log("migrated");
process.exit(0);
