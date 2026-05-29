# SeedWeaver 🌱

**Generate realistic, referentially-coherent test data from your real database schema — straight from Claude, Cursor, or any MCP client.**

Paste your `CREATE TABLE` SQL (or a JSON schema) and SeedWeaver generates seed data where **foreign keys actually resolve to real primary keys**, **unique constraints are respected**, and values are realistic (names, emails, dates, decimals). Unlike generic mock-data tools that spit out statistically random junk, SeedWeaver understands the *relationships* in your schema.

> Ask your AI: *"Generate 50 users and 200 orders for this schema"* — and get INSERTs you can run immediately, with every `order.user_id` pointing at a user that exists.

---

## Why SeedWeaver

Most "fake data" tools (Faker wrappers, random generators) give you isolated rows with no awareness of your schema. The moment you have foreign keys, you're back to hand-wiring relationships. SeedWeaver:

- **Resolves foreign keys** — referenced tables are generated first (topological ordering), and FK columns point at real generated keys.
- **Respects constraints** — unique columns stay unique, primary keys are unique, `NOT NULL` is honored.
- **Reads your real schema** — paste Postgres/MySQL `CREATE TABLE` DDL directly, no manual config.
- **Realistic values** — names, emails, addresses, companies, dates, decimals, enums.
- **Outputs what you need** — SQL `INSERT` statements, JSON, or CSV.

## Install

```bash
npx -y seedweaver-mcp
```

Add to your MCP client config (Claude Desktop / Cursor / Windsurf):

```json
{
  "mcpServers": {
    "seedweaver": {
      "command": "npx",
      "args": ["-y", "seedweaver-mcp"]
    }
  }
}
```

## Tools

| Tool | What it does |
|------|--------------|
| `analyze_schema` | Parse a schema (SQL DDL or JSON) and report tables, columns, relationships, and generation order. Run this first to confirm SeedWeaver reads your schema correctly. |
| `generate_seed_data` | Generate coherent test data. Returns SQL `INSERT`s (default), JSON, or CSV. |

## Examples

**From SQL DDL:**

```
Generate 20 rows of test data for:

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(100),
  created_at TIMESTAMP
);
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  total DECIMAL(10,2),
  status VARCHAR(20)
);
```

Every generated `orders.user_id` will be a real `users.id`.

**From a JSON schema** (gives you fine control — enums, ranges, per-table row counts):

```json
{
  "tables": [
    {
      "name": "users",
      "rows": 20,
      "columns": [
        { "name": "id", "type": "uuid", "primaryKey": true },
        { "name": "email", "type": "email", "unique": true },
        { "name": "name", "type": "fullName" }
      ]
    },
    {
      "name": "orders",
      "rows": 80,
      "columns": [
        { "name": "id", "type": "serial", "primaryKey": true },
        { "name": "user_id", "type": "fk", "references": "users.id" },
        { "name": "total", "type": "decimal", "min": 5, "max": 500 },
        { "name": "status", "type": "enum", "values": ["pending", "paid", "shipped"] }
      ]
    }
  ]
}
```

Supported column types: `uuid`, `serial`, `int`, `decimal`, `boolean`, `email`, `fullName`, `firstName`, `lastName`, `username`, `phone`, `address`, `city`, `country`, `company`, `url`, `word`, `sentence`, `paragraph`, `date`, `datetime`, `enum`, `fk`.

---

## Free vs. Pro

The free tier is fully functional for small schemas. **Pro** removes the limits and adds the features you need for real projects and CI.

| | Free | **Pro** |
|---|------|---------|
| Tables per schema | 2 | **Unlimited** |
| Rows per table | 50 | **Unlimited** |
| Output formats | SQL, JSON | **+ CSV** |
| Deterministic seeds (reproducible data) | — | **✓** |
| Custom locales | — | **✓** |
| Use in CI / automation | — | **✓** |

**[→ Get SeedWeaver Pro](https://your-gumroad-url.gumroad.com/l/seedweaver)** — $19/mo

Activate by setting your license key:

```json
{
  "mcpServers": {
    "seedweaver": {
      "command": "npx",
      "args": ["-y", "seedweaver-mcp"],
      "env": { "SEEDWEAVER_LICENSE": "your-key-here" }
    }
  }
}
```

---

## License

The SeedWeaver MCP server is MIT licensed and free to run. Pro features are unlocked with a paid license key. Built with the [Model Context Protocol](https://modelcontextprotocol.io).
