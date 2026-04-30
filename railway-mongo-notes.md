# Railway MongoDB Setup Notes

This document describes how to deploy and maintain the `mongo:7` container on
Railway for the WhatsApp message-log store.

---

## 1. Configuring the mongo:7 service on Railway

1. In your Railway project, click **New Service → Docker Image** and enter
   `mongo:7`.
2. Under **Settings → Volumes**, add a volume and set the **Mount Path** to
   `/data/db`. This is where MongoDB stores its data files; persisting it
   across deployments is essential.
3. Under **Variables**, add the following environment variable:

   | Variable                  | Value             |
   |---------------------------|-------------------|
   | `MONGO_INITDB_DATABASE`   | `whatsapp_logs`   |

4. Expose port `27017` in the service settings if you need external access
   (e.g., for local development or the .NET reporting API).  For internal
   Railway-to-Railway communication, keep the port private and connect via the
   internal Railway hostname.

---

## 2. Running mongo-init.js manually on the Railway container

Because Railway does not automatically mount a local file into
`/docker-entrypoint-initdb.d/`, you must run the initialization script by hand
the first time (or after wiping the volume).

```bash
# 1. Copy the script into the running container via Railway CLI
railway run --service mongo \
  mongosh whatsapp_logs /dev/stdin < mongo-init.js
```

Alternatively, open an interactive shell:

```bash
railway run --service mongo mongosh
```

Then paste or `load()` the contents of `mongo-init.js` directly.

> **Tip:** The initialization script is idempotent for the indexes (MongoDB
> skips duplicate index creation), but the seed `insertMany` will duplicate
> documents if run more than once.  Wrap inserts in an existence check or
> clear the seed data after the initial setup.

---

## 3. Backup recommendation

Run a scheduled cron job (e.g., GitHub Actions, Railway Cron, or an external
scheduler) that:

1. Executes `mongodump` inside the container and pipes the output to a
   compressed archive.
2. Uploads the archive to **Amazon S3** or **Cloudflare R2**.

Example cron script (run via `railway run --service mongo`):

```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="whatsapp_logs_${TIMESTAMP}.gz"

# Dump and compress in one step
mongodump \
  --uri="$MONGO_URL" \
  --db=whatsapp_logs \
  --archive \
  --gzip \
  > "/tmp/${BACKUP_FILE}"

# Upload to Cloudflare R2 (requires rclone configured with R2 credentials)
rclone copy "/tmp/${BACKUP_FILE}" r2:your-bucket-name/mongo-backups/

echo "Backup complete: ${BACKUP_FILE}"
```

Recommended schedule: **daily**, retaining the last **30 snapshots**.

---

## 4. When to migrate to MongoDB Atlas Flex

Consider migrating from the self-hosted `mongo:7` container to
**MongoDB Atlas Flex** when **any** of the following conditions are met:

| Trigger | Reason |
|---------|--------|
| Data volume exceeds **4 GB** | Atlas Flex auto-scales storage; self-hosted volumes need manual resizing on Railway. |
| Backup automation becomes critical | Atlas provides built-in continuous backups and point-in-time restore; replicating this with cron scripts adds operational risk. |
| Uptime SLA is required | Atlas offers multi-region replication; a single Railway container has no built-in failover. |
| Team grows beyond 2–3 engineers | Atlas's access control, audit logging, and monitoring dashboards reduce operational overhead significantly. |

Migration path: `mongodump` from the Railway container → `mongorestore` into
an Atlas cluster.  Update `MONGO_URL` in all services (WhatsApp bot, .NET API)
to point to the Atlas connection string.
