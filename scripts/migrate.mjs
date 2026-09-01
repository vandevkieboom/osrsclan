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

/**
 * The neon() HTTP client runs one statement per query, so the DDL file has to
 * be split on statement boundaries rather than sent as one multi-statement
 * string. A naive `schema.split(";")` was fine until schema.sql grew a
 * plpgsql trigger function — a `$$ ... $$` body contains its own semicolons,
 * and splitting inside one produces fragments that aren't valid SQL. This
 * walks the file instead, tracking whether it's currently inside a
 * dollar-quoted block (`$$` or `$tag$`), a single-quoted literal, or a `--`
 * line comment, and only treats a semicolon as a boundary outside all three.
 */
function splitStatements(source) {
  const statements = [];
  let current = "";
  let i = 0;
  let dollarTag = null;
  let inLineComment = false;
  let inString = false;

  while (i < source.length) {
    const ch = source[i];

    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }

    if (dollarTag) {
      if (source.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    if (inString) {
      current += ch;
      // '' is an escaped quote inside a literal, not the end of one.
      if (ch === "'" && source[i + 1] === "'") {
        current += "'";
        i += 2;
        continue;
      }
      if (ch === "'") inString = false;
      i++;
      continue;
    }

    if (ch === "-" && source[i + 1] === "-") {
      inLineComment = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      i++;
      continue;
    }

    const dollarMatch = /^\$[A-Za-z_]*\$/.exec(source.slice(i));
    if (dollarMatch) {
      dollarTag = dollarMatch[0];
      current += dollarTag;
      i += dollarTag.length;
      continue;
    }

    if (ch === ";") {
      statements.push(current);
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  statements.push(current);
  return statements.map((s) => s.trim()).filter(Boolean);
}

const statements = splitStatements(schema);

for (const statement of statements) {
  await sql.query(statement);
  const label = statement
    .split("\n")
    .find((line) => line.trim() && !line.trim().startsWith("--"));
  console.log("Applied:", (label ?? statement).trim().slice(0, 70));
}

console.log(`Schema applied (${statements.length} statements).`);
