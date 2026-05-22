# Railway Deployment Guide — Inkeep Agents

## Architecture Overview

This project has **8 services** that need to be deployed:

| Service | Type | Dockerfile / Image |
|---|---|---|
| `agents-api` | App (port 3002) | `Dockerfile.agents-api` |
| `manage-ui` | App (port 3000) | `Dockerfile.agents-manage-ui` |
| `migrate` | One-shot job | `Dockerfile.agents-migrate` |
| `doltgres` | Database | `dolthub/doltgresql:latest` (Docker image) |
| `postgres-run` | Database | Railway managed Postgres |
| `spicedb` | Auth service | `Dockerfile.spicedb` |
| `spicedb-postgres` | Database | Railway managed Postgres |

> **Free tier note:** Railway's Starter plan gives $5 credit/month. This stack (7 services) will likely consume $10–25/month depending on traffic. It works well for staging/dev. For always-free hosting, see the [Fly.io alternative](#flyio-free-alternative) at the bottom.

---

## Step 1 — Push your repo to GitHub

Make sure all these new files are committed and pushed:
- `railway/agents-api.toml`
- `railway/manage-ui.toml`
- `railway/migrate.toml`
- `railway/spicedb.toml`
- `Dockerfile.spicedb`

```bash
git add railway/ Dockerfile.spicedb
git commit -m "Add Railway deployment configs"
git push
```

---

## Step 2 — Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Empty Project**
3. Name it (e.g. `inkeep-agents`)

---

## Step 3 — Add the two managed Postgres databases

### 3a. Run Database (for agents runtime data)
1. In your project → **+ New** → **Database** → **Add PostgreSQL**
2. Rename it to `postgres-run`
3. Note the `DATABASE_URL` from its Variables tab — you'll use it as `INKEEP_AGENTS_RUN_DATABASE_URL`

### 3b. SpiceDB Database
1. Again → **+ New** → **Database** → **Add PostgreSQL**
2. Rename it to `spicedb-postgres`
3. Note its `DATABASE_URL` — you'll use it as the SpiceDB datastore URI

---

## Step 4 — Deploy DoltGres (manage database)

DoltGres is a special Postgres-compatible DB with Git version control. Railway doesn't have a managed version, so we run it as a Docker image service.

1. **+ New** → **Docker Image**
2. Image: `dolthub/doltgresql:latest`
3. Rename service to `doltgres`
4. Add these environment variables:
   ```
   DOLTGRES_USER=appuser
   DOLTGRES_PASSWORD=password
   DOLTGRES_DB=inkeep_agents
   ```
5. Under **Networking** → add a volume at path `/var/lib/doltgres` (so data persists across restarts)
6. Note the private domain shown in Railway — it will look like `doltgres.railway.internal`

---

## Step 5 — Deploy SpiceDB

1. **+ New** → **GitHub Repo** → select your repo
2. Rename service to `spicedb`
3. Go to **Settings → Source** → set **Config Path** to `railway/spicedb.toml`
4. Add environment variables:
   ```
   SPICEDB_DATASTORE_ENGINE=postgres
   SPICEDB_DATASTORE_CONN_URI=<DATABASE_URL from spicedb-postgres>
   SPICEDB_GRPC_PRESHARED_KEY=<your-secret-key>
   SPICEDB_HTTP_ENABLED=true
   SPICEDB_TELEMETRY_ENDPOINT=
   SPICEDB_METRICS_ENABLED=false
   ```
   > Replace `<DATABASE_URL from spicedb-postgres>` with the actual value from Step 3b.  
   > Replace `<your-secret-key>` with a strong random string.

---

## Step 6 — Deploy the Migration job

This runs DB schema migrations and creates the initial admin user. It must succeed before `agents-api` starts.

1. **+ New** → **GitHub Repo** → select your repo
2. Rename service to `migrate`
3. Go to **Settings → Source** → set **Config Path** to `railway/migrate.toml`
4. Add environment variables:

   ```
   ENVIRONMENT=production
   INKEEP_AGENTS_MANAGE_DATABASE_URL=postgresql://appuser:password@<doltgres.RAILWAY_PRIVATE_DOMAIN>:5432/inkeep_agents
   INKEEP_AGENTS_RUN_DATABASE_URL=<DATABASE_URL from postgres-run>
   SPICEDB_ENDPOINT=<spicedb.RAILWAY_PRIVATE_DOMAIN>:50051
   SPICEDB_PRESHARED_KEY=<same key as Step 5>
   SPICEDB_TLS_ENABLED=false
   INKEEP_AGENTS_MANAGE_UI_USERNAME=admin@example.com
   INKEEP_AGENTS_MANAGE_UI_PASSWORD=<strong-password>
   BETTER_AUTH_SECRET=<random-32-char-string>
   ```

   > Private domains look like `doltgres.railway.internal` — find them in each service's **Settings → Networking** tab.

---

## Step 7 — Deploy the Agents API

1. **+ New** → **GitHub Repo** → select your repo
2. Rename service to `agents-api`
3. Go to **Settings → Source** → set **Config Path** to `railway/agents-api.toml`
4. Set **Port** to `3002`
5. Add environment variables:

   ```
   ENVIRONMENT=production
   NODE_ENV=production
   LOG_LEVEL=info

   # Databases
   INKEEP_AGENTS_MANAGE_DATABASE_URL=postgresql://appuser:password@<doltgres.RAILWAY_PRIVATE_DOMAIN>:5432/inkeep_agents
   INKEEP_AGENTS_RUN_DATABASE_URL=<DATABASE_URL from postgres-run>

   # SpiceDB
   SPICEDB_ENDPOINT=<spicedb.RAILWAY_PRIVATE_DOMAIN>:50051
   SPICEDB_PRESHARED_KEY=<same key as Step 5>
   SPICEDB_TLS_ENABLED=false

   # URLs (fill in after manage-ui is deployed)
   INKEEP_AGENTS_MANAGE_UI_URL=https://<manage-ui.up.railway.app>
   INKEEP_AGENTS_API_URL=https://<agents-api.up.railway.app>
   PUBLIC_INKEEP_AGENTS_API_URL=https://<agents-api.up.railway.app>

   # AI Providers
   ANTHROPIC_API_KEY=<your-key>
   OPENAI_API_KEY=<your-key>

   # Auth
   INKEEP_AGENTS_JWT_SIGNING_SECRET=<random-32-char-string>
   INKEEP_AGENTS_RUN_API_BYPASS_SECRET=<random-32-char-string>
   ```

---

## Step 8 — Deploy the Manage UI

1. **+ New** → **GitHub Repo** → select your repo
2. Rename service to `manage-ui`
3. Go to **Settings → Source** → set **Config Path** to `railway/manage-ui.toml`
4. Set **Port** to `3000`
5. Add environment variables:

   ```
   ENVIRONMENT=production
   NODE_ENV=production

   # Internal (private network) URL of agents-api
   INKEEP_AGENTS_API_URL=http://<agents-api.RAILWAY_PRIVATE_DOMAIN>:3002

   # Public URL of agents-api (the Railway-generated public URL)
   PUBLIC_INKEEP_AGENTS_API_URL=https://<agents-api.up.railway.app>

   # Auth
   BETTER_AUTH_SECRET=<same as Step 6>
   ```

---

## Step 9 — Update cross-service URLs

Once all services are deployed and have public URLs:

1. In `agents-api` → update `INKEEP_AGENTS_MANAGE_UI_URL` to the manage-ui public URL
2. In `manage-ui` → update `PUBLIC_INKEEP_AGENTS_API_URL` to the agents-api public URL
3. Redeploy both services (Railway → service → **Redeploy**)

---

## Environment Variables Quick Reference

### Generate secrets locally
```bash
# Strong random strings for secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Railway variable references
Inside Railway env var fields, you can reference other services:
```
${{spicedb-postgres.DATABASE_URL}}   ← auto-fills the Postgres URL
${{doltgres.RAILWAY_PRIVATE_DOMAIN}} ← internal hostname
```

---

## Fly.io Free Alternative

If you need fully free hosting, **Fly.io** is a better fit. It has a generous always-free tier (3 VMs, 3GB volumes) and full Docker support.

Install the CLI:
```bash
brew install flyctl   # macOS
# or
curl -L https://fly.io/install.sh | sh
flyctl auth login
```

For each app service:
```bash
cd agent_trinetra
flyctl launch --dockerfile Dockerfile.agents-api --name inkeep-agents-api --no-deploy
flyctl launch --dockerfile Dockerfile.agents-manage-ui --name inkeep-manage-ui --no-deploy
```

For databases:
```bash
# Managed Postgres (free tier available)
flyctl postgres create --name inkeep-run-db

# DoltGres as a Fly app with a persistent volume
flyctl launch --image dolthub/doltgresql:latest --name inkeep-doltgres --no-deploy
flyctl volumes create doltgres_data --size 1 --app inkeep-doltgres
```

Fly.io free limits: 3 VMs always free, $0 for up to 160 GB outbound data/month. Most suitable for dev/staging use.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `agents-api` fails to start | `migrate` hasn't run yet | Wait for migrate to complete, then redeploy api |
| SpiceDB keeps restarting | Wrong `DATABASE_URL` format | Check the Postgres URL includes `?sslmode=disable` if needed |
| manage-ui shows API errors | `PUBLIC_INKEEP_AGENTS_API_URL` not set | Update env var with the agents-api public URL |
| DoltGres data lost on restart | No volume attached | Attach a Railway volume to `/var/lib/doltgres` on the doltgres service |
