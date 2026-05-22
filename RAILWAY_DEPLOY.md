# Railway Deployment Guide — Inkeep Agents

## Free-Tier Hybrid Strategy (Recommended)

Railway's free $5 credit runs out fast with 7+ services. The fix: offload the two standard Postgres databases and the Next.js UI to platforms that are **completely free**, so Railway only needs to run 4 Docker services.

| What | Platform | Cost |
|---|---|---|
| `postgres-run` (agents runtime DB) | **Neon** | Free forever |
| `spicedb-postgres` (SpiceDB DB) | **Neon** | Free forever |
| `manage-ui` (Next.js frontend) | **Vercel** | Free forever |
| `doltgres`, `spicedb`, `migrate`, `agents-api` | **Railway** | ~$3–5/month credit |

Sign up for free at [neon.tech](https://neon.tech) and [vercel.com](https://vercel.com) before continuing.

---

## Architecture Overview

This project has **8 services** split across platforms:

| Service | Platform | Dockerfile / Image |
|---|---|---|
| `agents-api` | Railway (port 3002) | `Dockerfile.agents-api` |
| `manage-ui` | **Vercel** (free) | `Dockerfile.agents-manage-ui` |
| `migrate` | Railway — one-shot job | `Dockerfile.agents-migrate` |
| `doltgres` | Railway — Docker image | `dolthub/doltgresql:latest` |
| `postgres-run` | **Neon (free)** | managed Postgres |
| `spicedb` | Railway — Docker build | `Dockerfile.spicedb` |
| `spicedb-postgres` | **Neon (free)** | managed Postgres |

> Railway now only runs 4 services (doltgres, spicedb, migrate, agents-api), which fits comfortably within the $5/month credit.

---

## Step 1 — Push your repo to GitHub

Make sure all these new files are committed and pushed:
- `railway/agents-api.toml`
- `railway/manage-ui.toml`
- `railway/migrate.toml`
- `railway/spicedb.toml`
- `Dockerfile.spicedb` (fixed — now Alpine-based so shell commands work)

```bash
git add railway/ Dockerfile.spicedb
git commit -m "Add Railway deployment configs"
git push
```

---

## Step 2 — Create two free Postgres databases on Neon

[neon.tech](https://neon.tech) → sign up free → **New Project**

### 2a. Run Database
1. Create a project named `inkeep-run`
2. Copy the **Connection string** (starts with `postgresql://...`) → this becomes `INKEEP_AGENTS_RUN_DATABASE_URL`

### 2b. SpiceDB Database
1. Create a project named `inkeep-spicedb`  
2. Copy its connection string → this becomes `SPICEDB_DATASTORE_CONN_URI`
3. Append `?sslmode=require` to the end if not already present

> Neon connection strings look like:  
> `postgresql://neondb_owner:abc123@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

---

## Step 3 — Create a Railway project (if you haven't already)

1. Go to [railway.app](https://railway.app) → **New Project** → **Empty Project**
2. Name it `inkeep-agents`

> **Delete** any Railway-managed Postgres services you already added — replace them with the Neon URLs from Step 2.

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
   > Replace `<DATABASE_URL from spicedb-postgres>` with the **Neon connection string** from Step 2b.  
   > Replace `<your-secret-key>` with a strong random string (generate one below).

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
   INKEEP_AGENTS_RUN_DATABASE_URL=<Neon connection string from Step 2a>
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
   INKEEP_AGENTS_RUN_DATABASE_URL=<Neon connection string from Step 2a>

   # SpiceDB
   SPICEDB_ENDPOINT=<spicedb.RAILWAY_PRIVATE_DOMAIN>:50051
   SPICEDB_PRESHARED_KEY=<same key as Step 5>
   SPICEDB_TLS_ENABLED=false

   # URLs (fill in after manage-ui Vercel URL is known — see Step 8)
   INKEEP_AGENTS_MANAGE_UI_URL=https://<your-project.vercel.app>
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

## Step 8 — Deploy the Manage UI on Vercel (free)

The manage-ui is a Next.js app — Vercel hosts it for free with zero config.

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo
2. Set **Root Directory** to `apps/manage-ui`
3. Framework: **Next.js** (auto-detected)
4. Add environment variables:

   ```
   ENVIRONMENT=production
   NODE_ENV=production

   # agents-api public URL (from Railway)
   INKEEP_AGENTS_API_URL=https://<agents-api.up.railway.app>
   PUBLIC_INKEEP_AGENTS_API_URL=https://<agents-api.up.railway.app>

   # Auth
   BETTER_AUTH_SECRET=<same as Step 6>
   ```

5. Click **Deploy** — Vercel gives you a free `https://your-project.vercel.app` URL
6. Copy that URL back into `agents-api`'s `INKEEP_AGENTS_MANAGE_UI_URL` on Railway, then redeploy agents-api

---

## Step 9 — Final URL wiring

Once agents-api and manage-ui are both deployed:

1. In Railway `agents-api` service → update `INKEEP_AGENTS_MANAGE_UI_URL` with your Vercel URL
2. In Vercel `manage-ui` → update `INKEEP_AGENTS_API_URL` with your Railway agents-api URL
3. Redeploy both (Railway: click **Redeploy**; Vercel: click **Redeploy** or push a commit)

---

## Environment Variables Quick Reference

### Generate secrets locally
```bash
# Strong random strings for secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Railway variable references
Inside Railway env var fields, you can reference other Railway services:
```
${{doltgres.RAILWAY_PRIVATE_DOMAIN}} ← internal hostname for doltgres
${{spicedb.RAILWAY_PRIVATE_DOMAIN}}  ← internal hostname for spicedb
```
Neon and Vercel URLs are plain strings — just paste them directly.

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
| `agents-api` fails to start | `migrate` hasn't finished yet | Wait for migrate to show green/exited, then redeploy api |
| SpiceDB crashes immediately | Wrong Neon URL or missing `?sslmode=require` | Check `SPICEDB_DATASTORE_CONN_URI` ends with `?sslmode=require` |
| SpiceDB "migrate head" fails | Neon DB not reachable | Verify the Neon project is active and the connection string is correct |
| manage-ui shows API CORS errors | `PUBLIC_INKEEP_AGENTS_API_URL` not set on Vercel | Add the Railway agents-api URL to Vercel env vars and redeploy |
| DoltGres data lost on restart | No volume attached | In Railway → doltgres service → **Volumes** → add volume at `/var/lib/doltgres` |
| Railway says "add payment method" | Free credit exhausted | Move postgres services to Neon (Step 2) to reduce active Railway services |
