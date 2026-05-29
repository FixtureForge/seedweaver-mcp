import { faker } from "@faker-js/faker";
import { SchemaDef, TableDef, ColumnDef, GenerateOptions } from "./types.js";

interface GeneratedTable {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
  // primary key values, for FK resolution
  pkValues: unknown[];
  pkColumn: string | null;
}

export interface GenerationResult {
  tables: GeneratedTable[];
  order: string[];
}

// Topologically sort tables so referenced tables are generated before referencing ones.
function orderTables(schema: SchemaDef): TableDef[] {
  const byName = new Map(schema.tables.map((t) => [t.name, t]));
  const visited = new Set<string>();
  const result: TableDef[] = [];
  const visiting = new Set<string>();

  function visit(table: TableDef) {
    if (visited.has(table.name)) return;
    if (visiting.has(table.name)) {
      // cycle — break it, generate anyway
      return;
    }
    visiting.add(table.name);
    for (const col of table.columns) {
      if (col.type === "fk" && col.references) {
        const refTable = col.references.split(".")[0];
        const dep = byName.get(refTable);
        if (dep && dep.name !== table.name) visit(dep);
      }
    }
    visiting.delete(table.name);
    visited.add(table.name);
    result.push(table);
  }

  for (const t of schema.tables) visit(t);
  return result;
}

export function generate(
  schema: SchemaDef,
  opts: GenerateOptions
): GenerationResult {
  // Seed for deterministic output (Pro feature, but engine always supports it).
  if (opts.seed !== undefined) faker.seed(opts.seed);

  const ordered = orderTables(schema);
  const generated = new Map<string, GeneratedTable>();
  const order: string[] = [];

  for (const table of ordered) {
    const rowCount = table.rows ?? opts.defaultRows;
    const pkCol = table.columns.find((c) => c.primaryKey) ?? null;
    const uniqueTrackers = new Map<string, Set<unknown>>();
    for (const c of table.columns) {
      if (c.unique || c.primaryKey) uniqueTrackers.set(c.name, new Set());
    }

    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < rowCount; i++) {
      const row: Record<string, unknown> = {};
      for (const col of table.columns) {
        row[col.name] = generateValue(col, i, generated, uniqueTrackers);
      }
      rows.push(row);
    }

    const pkValues = pkCol ? rows.map((r) => r[pkCol.name]) : [];
    const gt: GeneratedTable = {
      name: table.name,
      columns: table.columns.map((c) => c.name),
      rows,
      pkValues,
      pkColumn: pkCol ? pkCol.name : null,
    };
    generated.set(table.name, gt);
    order.push(table.name);
  }

  return { tables: order.map((n) => generated.get(n)!), order };
}

function generateValue(
  col: ColumnDef,
  index: number,
  generated: Map<string, GeneratedTable>,
  uniqueTrackers: Map<string, Set<unknown>>
): unknown {
  // Nullable columns occasionally null (not for PK/unique/fk).
  if (col.nullable && !col.primaryKey && !col.unique && col.type !== "fk") {
    if (faker.number.int({ min: 0, max: 9 }) === 0) return null;
  }

  const tracker = uniqueTrackers.get(col.name);
  const makeValue = (): unknown => rawValue(col, index, generated);

  if (tracker) {
    // Retry until unique (bounded), else fall back to a suffixed value.
    for (let attempt = 0; attempt < 50; attempt++) {
      const v = col.primaryKey && (col.type === "serial" || col.type === "int")
        ? index + 1
        : makeValue();
      if (!tracker.has(v)) {
        tracker.add(v);
        return v;
      }
    }
    const fallback = `${makeValue()}_${index}`;
    tracker.add(fallback);
    return fallback;
  }

  return makeValue();
}

function rawValue(
  col: ColumnDef,
  index: number,
  generated: Map<string, GeneratedTable>
): unknown {
  switch (col.type) {
    case "fk": {
      if (!col.references) return null;
      const [refTable] = col.references.split(".");
      const ref = generated.get(refTable);
      if (!ref || ref.pkValues.length === 0) return null;
      return faker.helpers.arrayElement(ref.pkValues);
    }
    case "uuid":
      return faker.string.uuid();
    case "serial":
    case "int":
      return faker.number.int({ min: col.min ?? 1, max: col.max ?? 100000 });
    case "decimal":
      return Number(
        faker.number
          .float({ min: col.min ?? 0, max: col.max ?? 1000, fractionDigits: 2 })
          .toFixed(2)
      );
    case "boolean":
      return faker.datatype.boolean();
    case "email":
      return faker.internet.email().toLowerCase();
    case "fullName":
      return faker.person.fullName();
    case "firstName":
      return faker.person.firstName();
    case "lastName":
      return faker.person.lastName();
    case "username":
      return faker.internet.username().toLowerCase();
    case "productName":
      return faker.commerce.productName();
    case "title": {
      const words = faker.lorem.words({ min: 2, max: 4 });
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
    case "phone":
      return faker.phone.number();
    case "address":
      return faker.location.streetAddress();
    case "city":
      return faker.location.city();
    case "country":
      return faker.location.country();
    case "company":
      return faker.company.name();
    case "url":
      return faker.internet.url();
    case "word":
      return faker.lorem.word();
    case "sentence":
      return faker.lorem.sentence();
    case "paragraph":
      return faker.lorem.paragraph();
    case "date":
      return faker.date.past().toISOString().split("T")[0];
    case "datetime":
      return faker.date.past().toISOString().replace("T", " ").split(".")[0];
    case "enum":
      return col.values && col.values.length
        ? faker.helpers.arrayElement(col.values)
        : null;
    default:
      return faker.lorem.word();
  }
}

// ---- Output formatting ----

export function toSQL(result: GenerationResult): string {
  const out: string[] = [];
  for (const t of result.tables) {
    if (t.rows.length === 0) continue;
    const cols = t.columns.map((c) => `"${c}"`).join(", ");
    for (const row of t.rows) {
      const vals = t.columns.map((c) => sqlLiteral(row[c])).join(", ");
      out.push(`INSERT INTO "${t.name}" (${cols}) VALUES (${vals});`);
    }
    out.push("");
  }
  return out.join("\n").trim();
}

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function toJSON(result: GenerationResult): string {
  const obj: Record<string, unknown[]> = {};
  for (const t of result.tables) obj[t.name] = t.rows;
  return JSON.stringify(obj, null, 2);
}

export function toCSV(result: GenerationResult): string {
  const blocks: string[] = [];
  for (const t of result.tables) {
    const header = t.columns.join(",");
    const lines = t.rows.map((row) =>
      t.columns.map((c) => csvCell(row[c])).join(",")
    );
    blocks.push(`# ${t.name}\n${header}\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
