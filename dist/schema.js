// Accepts either a JSON schema object/string or raw SQL DDL and returns a SchemaDef.
export function parseSchema(input) {
    const trimmed = input.trim();
    // Try JSON first.
    if (trimmed.startsWith("{")) {
        const obj = JSON.parse(trimmed);
        if (!obj.tables || !Array.isArray(obj.tables)) {
            throw new Error("JSON schema must have a 'tables' array.");
        }
        return obj;
    }
    // Otherwise treat as SQL DDL.
    return parseDDL(trimmed);
}
// Best-effort parser for common Postgres/MySQL CREATE TABLE statements.
export function parseDDL(ddl) {
    const tables = [];
    // Split on CREATE TABLE statements.
    const stmtRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\)\s*;/gi;
    let match;
    while ((match = stmtRegex.exec(ddl)) !== null) {
        const tableName = match[1];
        const body = match[2];
        const columns = [];
        // Split body into top-level comma-separated parts (ignoring commas inside parens).
        const parts = splitTopLevel(body);
        for (const rawPart of parts) {
            const part = rawPart.trim();
            if (!part)
                continue;
            const lower = part.toLowerCase();
            // Skip table-level constraints we handle separately or ignore.
            if (/^(primary\s+key|unique|foreign\s+key|constraint|check|key)\b/i.test(part)) {
                // Handle table-level PRIMARY KEY (col) and FOREIGN KEY (col) REFERENCES t(c).
                const pkMatch = /^primary\s+key\s*\(\s*["`]?(\w+)["`]?\s*\)/i.exec(part);
                if (pkMatch) {
                    const col = columns.find((c) => c.name === pkMatch[1]);
                    if (col)
                        col.primaryKey = true;
                }
                const fkMatch = /^foreign\s+key\s*\(\s*["`]?(\w+)["`]?\s*\)\s*references\s+["`]?(\w+)["`]?\s*\(\s*["`]?(\w+)["`]?\s*\)/i.exec(part);
                if (fkMatch) {
                    const col = columns.find((c) => c.name === fkMatch[1]);
                    if (col) {
                        col.type = "fk";
                        col.references = `${fkMatch[2]}.${fkMatch[3]}`;
                    }
                }
                continue;
            }
            const colMatch = /^["`]?(\w+)["`]?\s+(\w+(?:\s*\([^)]*\))?)(.*)$/i.exec(part);
            if (!colMatch)
                continue;
            const colName = colMatch[1];
            const sqlType = colMatch[2].toLowerCase();
            const rest = colMatch[3] || "";
            const col = {
                name: colName,
                type: mapSqlType(colName, sqlType, tableName),
            };
            if (/\bprimary\s+key\b/i.test(rest))
                col.primaryKey = true;
            if (/\bunique\b/i.test(rest))
                col.unique = true;
            if (/\bnot\s+null\b/i.test(rest))
                col.nullable = false;
            // Inline REFERENCES.
            const refMatch = /references\s+["`]?(\w+)["`]?\s*\(\s*["`]?(\w+)["`]?\s*\)/i.exec(rest);
            if (refMatch) {
                col.type = "fk";
                col.references = `${refMatch[1]}.${refMatch[2]}`;
            }
            columns.push(col);
        }
        tables.push({ name: tableName, columns });
    }
    if (tables.length === 0) {
        throw new Error("Could not parse any CREATE TABLE statements. Pass valid SQL DDL or a JSON schema.");
    }
    return { tables };
}
function splitTopLevel(s) {
    const parts = [];
    let depth = 0;
    let current = "";
    for (const ch of s) {
        if (ch === "(")
            depth++;
        if (ch === ")")
            depth--;
        if (ch === "," && depth === 0) {
            parts.push(current);
            current = "";
        }
        else {
            current += ch;
        }
    }
    if (current.trim())
        parts.push(current);
    return parts;
}
function mapSqlType(colName, sqlType, tableName) {
    const t = sqlType.replace(/\(.*\)/, "");
    const name = colName.toLowerCase();
    const table = (tableName || "").toLowerCase();
    // Heuristics by column name for nicer fakes.
    if (name === "email" || name.endsWith("_email"))
        return "email";
    if (name === "username")
        return "username";
    if (name.includes("phone"))
        return "phone";
    if (name.includes("country"))
        return "country";
    if (name.includes("city"))
        return "city";
    if (name.includes("address"))
        return "address";
    if (name.includes("company"))
        return "company";
    if (name === "url" || name.endsWith("_url"))
        return "url";
    if (name === "name" || name.endsWith("_name")) {
        if (name.includes("first"))
            return "firstName";
        if (name.includes("last"))
            return "lastName";
        if (name.includes("user"))
            return "username";
        if (name.includes("company") || name.includes("org"))
            return "company";
        // Explicit person signals in the column name.
        if (/(full|contact|customer|author|owner|employee|person|client|manager|recipient|sender|guest|member)/.test(name))
            return "fullName";
        // Bare "name" / "<thing>_name": infer from the table it belongs to.
        if (/(user|customer|person|people|member|contact|employee|author|client|profile|account|student|patient|guest|attendee|staff)/.test(table))
            return "fullName";
        if (/(compan|organi|vendor|supplier|brand|merchant|partner)/.test(table))
            return "company";
        if (/(product|item|sku|catalog|good|inventory|listing)/.test(table))
            return "productName";
        if (/(city|cities|town|place)/.test(table))
            return "city";
        if (/(countr)/.test(table))
            return "country";
        // Generic fallback: a short title-like label, not a person's name.
        return "title";
    }
    // Map by SQL type.
    switch (t) {
        case "uuid":
            return "uuid";
        case "serial":
        case "bigserial":
            return "serial";
        case "int":
        case "integer":
        case "smallint":
        case "bigint":
        case "tinyint":
            return "int";
        case "decimal":
        case "numeric":
        case "float":
        case "double":
        case "real":
        case "money":
            return "decimal";
        case "bool":
        case "boolean":
            return "boolean";
        case "date":
            return "date";
        case "timestamp":
        case "timestamptz":
        case "datetime":
            return "datetime";
        case "text":
        case "varchar":
        case "char":
        case "character":
            return "sentence";
        default:
            return "sentence";
    }
}
