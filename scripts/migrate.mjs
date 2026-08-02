import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL (or POSTGRES_URL) environment variable is not set. Run `vercel env pull .env.local` first.",
  );
}

const sql = neon(connectionString);
const schemaPath = new URL("../db/schema.sql", import.meta.url);
const schema = readFileSync(schemaPath, "utf8");

// The neon() HTTP client runs one statement per query, so split the DDL file
// on statement boundaries rather than sending it as one multi-statement string.
const statements = schema
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
  console.log("Applied:", statement.split("\n")[0].slice(0, 60));
}

console.log(`Schema applied (${statements.length} statements).`);
