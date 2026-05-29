// Core type definitions for SeedWeaver schemas.

export type ColumnType =
  | "uuid"
  | "serial"
  | "int"
  | "decimal"
  | "boolean"
  | "email"
  | "fullName"
  | "firstName"
  | "lastName"
  | "username"
  | "productName"
  | "title"
  | "phone"
  | "address"
  | "city"
  | "country"
  | "company"
  | "url"
  | "word"
  | "sentence"
  | "paragraph"
  | "date"
  | "datetime"
  | "enum"
  | "fk";

export interface ColumnDef {
  name: string;
  type: ColumnType;
  primaryKey?: boolean;
  unique?: boolean;
  nullable?: boolean;
  // For numeric types
  min?: number;
  max?: number;
  // For enum
  values?: string[];
  // For fk: "table.column"
  references?: string;
}

export interface TableDef {
  name: string;
  rows?: number;
  columns: ColumnDef[];
}

export interface SchemaDef {
  tables: TableDef[];
}

export type OutputFormat = "sql" | "json" | "csv";

export interface GenerateOptions {
  format: OutputFormat;
  defaultRows: number;
  seed?: number;
  locale?: string;
}
