#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseSchema } from "./schema.js";
import { generate, toSQL, toJSON, toCSV } from "./generator.js";
import { OutputFormat } from "./types.js";

// ---- Freemium gate --------------------------------------------------------
// Free tier limits. A valid license key (set via SEEDWEAVER_LICENSE env var)
// unlocks Pro. License validation is intentionally a stub here — wire it to
// your license provider (Gumroad/Lemon Squeezy license API, or a signed key)
// before launch. For now any non-empty key unlocks Pro so you can test both paths.
const FREE_MAX_TABLES = 2;
const FREE_MAX_ROWS = 50;
const FREE_FORMATS: OutputFormat[] = ["sql", "json"];

function isPro(): boolean {
  const key = process.env.SEEDWEAVER_LICENSE;
  return !!key && key.trim().length > 0;
  // TODO: replace with real validation, e.g. verify against Gumroad license API.
}

const PRO_URL = "https://your-gumroad-url.gumroad.com/l/seedweaver"; // placeholder

// ---- Server ---------------------------------------------------------------
const server = new McpServer({
  name: "seedweaver",
  version: "0.1.0",
});

server.tool(
  "analyze_schema",
  "Parse a database schema (SQL CREATE TABLE statements or a JSON schema) and report its tables, columns, relationships, and the order seed data would be generated in. Use this first to confirm SeedWeaver understands the schema correctly.",
  {
    schema: z
      .string()
      .describe(
        "The schema to analyze: either raw SQL DDL (CREATE TABLE ...) or a JSON schema object with a 'tables' array."
      ),
  },
  async ({ schema }) => {
    try {
      const parsed = parseSchema(schema);
      const lines: string[] = [];
      lines.push(`Parsed ${parsed.tables.length} table(s):\n`);
      for (const t of parsed.tables) {
        lines.push(`• ${t.name}`);
        for (const c of t.columns) {
          const tags: string[] = [c.type];
          if (c.primaryKey) tags.push("PK");
          if (c.unique) tags.push("unique");
          if (c.type === "fk" && c.references) tags.push(`→ ${c.references}`);
          lines.push(`    - ${c.name} (${tags.join(", ")})`);
        }
      }
      const fkCount = parsed.tables
        .flatMap((t) => t.columns)
        .filter((c) => c.type === "fk").length;
      lines.push(`\n${fkCount} foreign-key relationship(s) detected.`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return {
        content: [
          { type: "text", text: `Error parsing schema: ${(err as Error).message}` },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "generate_seed_data",
  "Generate realistic, referentially-coherent test data from a database schema. Foreign keys resolve to real generated primary keys, unique constraints are respected, and values are realistic (names, emails, dates). Accepts SQL DDL or a JSON schema. Returns INSERT statements, JSON, or CSV.",
  {
    schema: z
      .string()
      .describe("SQL DDL (CREATE TABLE ...) or a JSON schema with a 'tables' array."),
    rows: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Default rows per table (individual tables can override via 'rows' in JSON schema). Defaults to 10."),
    format: z
      .enum(["sql", "json", "csv"])
      .optional()
      .describe("Output format. 'sql' (INSERT statements, default), 'json', or 'csv'. CSV is a Pro feature."),
    seed: z
      .number()
      .int()
      .optional()
      .describe("Deterministic seed for reproducible output. Pro feature."),
  },
  async ({ schema, rows, format, seed }) => {
    try {
      const parsed = parseSchema(schema);
      const pro = isPro();
      const fmt: OutputFormat = format ?? "sql";
      const defaultRows = rows ?? 10;
      const notices: string[] = [];

      // Enforce free-tier limits.
      if (!pro) {
        if (parsed.tables.length > FREE_MAX_TABLES) {
          return gateError(
            `Free tier supports up to ${FREE_MAX_TABLES} tables; this schema has ${parsed.tables.length}. Upgrade to Pro for unlimited tables.`
          );
        }
        if (defaultRows > FREE_MAX_ROWS) {
          return gateError(
            `Free tier supports up to ${FREE_MAX_ROWS} rows per table; you requested ${defaultRows}. Upgrade to Pro for unlimited rows.`
          );
        }
        if (!FREE_FORMATS.includes(fmt)) {
          return gateError(
            `Format '${fmt}' is a Pro feature. Free tier supports: ${FREE_FORMATS.join(", ")}.`
          );
        }
        if (seed !== undefined) {
          notices.push("Note: deterministic 'seed' is a Pro feature and was ignored on the free tier.");
        }
      }

      const result = generate(parsed, {
        format: fmt,
        defaultRows,
        seed: pro ? seed : undefined,
        locale: "en",
      });

      let output: string;
      if (fmt === "json") output = toJSON(result);
      else if (fmt === "csv") output = toCSV(result);
      else output = toSQL(result);

      const header = pro ? "" : "[SeedWeaver Free] ";
      const footer = notices.length ? `\n\n${notices.join("\n")}` : "";
      return {
        content: [
          { type: "text", text: `${header}Generated data for ${result.order.length} table(s) [${result.order.join(", ")}]:\n\n${output}${footer}` },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

function gateError(msg: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: `${msg}\n\nGet SeedWeaver Pro: ${PRO_URL}`,
      },
    ],
    isError: true,
  };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs over stdio; no stdout logging (it would corrupt the protocol).
  console.error("SeedWeaver MCP server running on stdio.");
}

main().catch((err) => {
  console.error("Fatal error starting SeedWeaver:", err);
  process.exit(1);
});
