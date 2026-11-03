import { createDb, runMigrations } from "@techgens/db";
import { loadConfig } from "./config";

const config = loadConfig();
const { db, close } = createDb(config.databaseUrl, { max: 1 });
await runMigrations(db);
await close();
console.log("migrations applied");
