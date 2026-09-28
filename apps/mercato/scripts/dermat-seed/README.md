# Dermat ERP: server setup and seed

Sets up a new server with the full Dermat setup: departments, roles and access, department logins,
company details, product fields, vendors, customers, products (raw material, packing material, bulk,
finished goods, with opening stock), formulas and pack BOMs, QC rules, and optionally about 23 demo
orders at every stage (with purchases, GRNs, QC, store issues, invoices, payments and dispatch).

Everything goes through the app's own API, so all records are connected exactly as in normal use.
Only Python 3.9+ is needed (standard library, nothing to install).

There is one organization and one tenant ("Dermat India"). `mercato init` creates them, and the
seed finds them by itself. You never type an ID.

## What you need on the server

- Node 22+ with corepack, and this repo
- PostgreSQL 17 **with pgvector** (the `pgvector/pgvector:pg17` Docker image works) and `psql`
- Redis
- Python 3.9+
- `Dermat_Test_Users.csv` (Name, Email, Password): copy it to the server by hand. It is **not** in git.

## 1. Configure

Copy `apps/mercato/.env.example` to `apps/mercato/.env` and set at least:

| Setting | Value |
|---|---|
| `DATABASE_URL` | the server database, e.g. `postgres://dermat:<password>@localhost:5432/dermat_india` |
| `REDIS_URL` | e.g. `redis://localhost:6379` |
| `APP_URL` | the address people open, e.g. `http://192.168.1.20:3000` or `https://erp.example.com` |
| `JWT_SECRET`, `AUTH_SECRET`, `NEXTAUTH_SECRET` | long random strings (`openssl rand -hex 32`) |
| `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` | long random string. **Keep a copy somewhere safe.** Customer names, contacts and addresses are encrypted with it; if it is lost or changed they cannot be read again. |
| `ALLOW_INSECURE_HTTP_COOKIES=true` | only while the app is served over plain `http://` (no HTTPS). Remove it once HTTPS is set up. |

## 2. Create the database structure

The database must be empty. Load the ready-made structure from this folder:

```bash
createdb dermat_india            # or create it in your Postgres admin tool
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/mercato/scripts/dermat-seed/db/schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/mercato/scripts/dermat-seed/db/migrations-applied.sql
```

Why: several Open Mercato module migrations in this repo were generated against an existing database
and fail on an empty one. `schema.sql` is the working structure taken from the development database,
and `migrations-applied.sql` marks those migrations as already done. Migrations added after this
file was made still run normally in step 3.

## 3. Build and initialize

```bash
corepack enable
corepack yarn install
corepack yarn build
corepack yarn mercato init --org="Dermat India" --email=<admin email> --password=<strong password> --no-examples
```

`init` also creates a demo login `employee@<your admin domain>` with the password `secret`.
**Delete it** afterwards (Masters → Team & access, or Settings → Users).

## 4. Start the app

```bash
corepack yarn start      # serves on port 3000 (set PORT to change it)
```

Keep it running (for example with `pm2`, a `systemd` service, or `tmux`).

## 5. Run the seed

From the repo root, with the app running:

```bash
python3 apps/mercato/scripts/dermat-seed/seed.py \
  --url http://localhost:3000 \
  --admin-email <admin email> \
  --users /path/to/Dermat_Test_Users.csv \
  --sql "psql $DATABASE_URL -At -F '|'"
```

It asks for the admin password (or set `DERMAT_ADMIN_PASSWORD`). It takes about 10–20 minutes,
mostly for the demo orders. At the end it prints `Finished with 0 problem(s).`

Useful options:

| Option | What it does |
|---|---|
| `--only masters` | everything except demo orders (for a server the client will fill with real orders) |
| `--only demo` | only the demo orders, extras and back-dating |
| `--only users` | only create the department logins |
| `--skip backdate` | keep all demo dates as today (no direct database access needed) |
| `--sql "..."` | needed only for `backdate`, which spreads demo order dates over the past weeks |

Running it again is safe: records that already exist (matched by name or code) are left alone, and
demo orders are only added when the order book is empty.

Each department login gets the same email, password and access as on the development laptop
(from `Dermat_Test_Users.csv` and `data/roles.json`). Delete the CSV from the server when done.

## Updating the seed data

The files in `data/` were exported from the development laptop. To refresh them after changing
masters there:

```bash
python3 apps/mercato/scripts/dermat-seed/export_data.py --url http://localhost:3000 --admin-email <admin email> \
  --sql "psql $DATABASE_URL -At -F '|'"
```

`data/company.json` holds the company's GSTIN and bank details for printed documents. Keep this
repository private.

## Files

| File | Purpose |
|---|---|
| `seed.py` | the seed (masters, logins, demo orders) |
| `orders.py` | the demo orders and how far each one goes |
| `export_data.py` | refreshes `data/` from a running instance |
| `client.py` | small HTTP client used by both |
| `data/*.json` | exported master data (no passwords, no keys) |
| `db/schema.sql`, `db/migrations-applied.sql` | database structure for a new server |
