# Cloudflare R2 Setup for BookOne Receipts

> **Goal:** Store receipt uploads in Cloudflare R2 (10 GB free tier) instead of running our own MinIO. R2's S3-compatible API means our app code doesn't change between MinIO and R2 — only the env vars do.

---

## 1. Create the bucket

1. Log in to the **Cloudflare dashboard**: https://dash.cloudflare.com/
2. In the left sidebar, click **R2** → **Object Storage** → **Create bucket**.
3. Bucket name: **`bookone-receipts`** (must be globally unique; if taken, add a suffix like `bookone-receipts-prod`).
4. Location: **Automatic** (recommended).
5. Under **Settings**, set:
   - **Default storage class:** Standard
   - **Public access:** ❌ **Disabled** (private bucket — we'll use presigned URLs)
6. Click **Create bucket**.

## 2. Create an API token

1. R2 → **Manage R2 API Tokens** (top-right).
2. Click **Create API token**.
3. Permissions: **Object Read & Write**.
4. Scope: **Apply to specific buckets** → select `bookone-receipts`.
5. TTL: leave as default (no expiry) **or** set a 1-year expiry for better security.
6. Click **Create API Token**.
7. **Copy these three values** — you will only see them once:
   - **Access Key ID**
   - **Secret Access Key**
   - **Account ID** (shown on the R2 overview page, top-right under "Account ID")

## 3. Find your endpoint URL

The S3-compatible endpoint format is:

```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Example: if your Account ID is `a1b2c3d4e5f6...`, then:

```
S3_ENDPOINT=https://a1b2c3d4e5f6.r2.cloudflarestorage.com
```

## 4. Add env vars to VPS

In Portainer stack → **Environment variables**, add (replace `<...>` with real values):

```bash
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY=<Access Key ID from step 2>
S3_SECRET_KEY=<Secret Access Key from step 2>
S3_BUCKET=bookone-receipts
S3_REGION=auto
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_URL=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Also add the same block to your local `.env` (and `.env.example` for the team).

## 5. Allow public read of receipts (optional)

By default the bucket is **fully private** — only presigned URLs work. We will:

- Issue **presigned GET URLs** valid for 10 minutes whenever a logged-in user requests to view a receipt.
- Issue **presigned PUT URLs** so the browser uploads directly to R2 without our Next.js server proxying the file.

The app code (Phase A.5) will handle this — no bucket policy changes needed.

## 6. Cost expectations

| Tier | Limit | Cost |
|------|-------|------|
| Storage | 10 GB / month | **Free** |
| Class A ops (writes) | 10 million / month | **Free** |
| Class B ops (reads) | 10 million / month | **Free** |
| Egress | Unlimited | **Free** (R2's killer feature) |

A typical BookOne tenant with 50 receipts/month (~2 MB each) stays well within free tier for years.

## 7. Backups

R2 data is durable across Cloudflare's network but **still your responsibility to back up**. Recommended:

- Enable R2 → bucket → **Lifecycle rules** → keep prior versions for 30 days.
- Schedule a weekly `rclone sync` to a second bucket or local VPS disk.

## 8. Test the connection locally

After updating `.env`:

```bash
cd apps/web
pnpm exec tsx -e "
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
const c = new S3Client({
  region: 'auto',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});
c.send(new ListBucketsCommand({})).then(console.log).catch(console.error);
"
```

If you see your buckets listed, the credentials work.

---

## Once you have the credentials

Paste them here in the chat and I'll:

1. Add the same 6 vars to `.env.example`
2. Document the values to add to Portainer
3. Wire `uploadReceipt()` server action in Phase A.5
4. Wire presigned URL generation for the read path
