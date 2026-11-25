# CloudBlog

A fast, secure, serverless blog on AWS, built to run at **about $0–3/month for ~1,000 readers**.
It has a React frontend, Lambda + DynamoDB behind an HTTP API, and CloudFront at the edge. All of it is managed with Terraform and deployed by GitHub Actions.

```
 Readers ──► CloudFront ──► S3 (React app, prerendered post pages, RSS, sitemap)
               │   └──────► S3 /media/* (uploaded images)
               │
 Browser ──► API Gateway (HTTP API) ──► Lambda public-api ──► DynamoDB (posts, comments, views)
               │  JWT (Cognito)    └──► Lambda admin-api  ──► S3 presigned uploads
                                                          └─► SNS email (new comment, alarms)
 DynamoDB stream ──► Lambda publisher ──► S3 static pages + RSS + sitemap ──► CloudFront invalidation
 EventBridge (5 min) ──► Lambda publisher (publishes scheduled posts)
```

## Features

**Readers**
- An editorial design with light and dark mode, client-side search, and category and tag filters
- Readable URLs (`/posts/my-post`), reading progress, a table of contents, syntax highlighting and share buttons
- Moderated comments, with a honeypot field and per-route rate limits against spam
- SEO: each post is prerendered to static HTML with OpenGraph/Twitter cards and JSON-LD; RSS, sitemap and robots.txt are generated too

**Writer (`/admin`)**
- Cognito sign-in (authorization code + PKCE, admin group, optional TOTP MFA)
- A Markdown editor with toolbar, split live preview, drag-and-drop or paste image upload (direct to S3), Ctrl+S to save, and a warning before leaving with unsaved changes
- Drafts, publishing, scheduled publishing, featured posts, cover images
- A dashboard (views, top posts, pending comments) and a comment moderation queue

**Security and operations**
- Private S3 buckets behind CloudFront Origin Access Control, plus security headers and a strict CSP
- One least-privilege IAM role per Lambda, scoped to specific tables, keys and actions
- Every post and comment is sanitized (DOMPurify in the browser, sanitize-html on the server); comments render as plain text
- DynamoDB point-in-time recovery, deletion protection and throughput caps; versioned media bucket
- A CloudWatch dashboard, error alarms, and an **AWS Budget alert at $10/month**
- GitHub Actions authenticates through OIDC, so no AWS keys are stored in GitHub

## Repository layout

| Path | What |
|---|---|
| `frontend/` | React 19 + Vite + TanStack Query + React Router |
| `backend/` | TypeScript Lambda handlers (`public`, `admin`, `publisher`), bundled with esbuild |
| `infra/bootstrap/` | One-time setup: Terraform state bucket + GitHub OIDC roles |
| `infra/envs/prod/` | The whole application stack |
| `infra/modules/lambda/` | Reusable Lambda + IAM role + log group module |
| `scripts/` | `deploy-frontend.sh`, `write-config.sh` |
| `.github/workflows/` | `ci.yml` (pull requests) and `deploy.yml` (main → production) |

## First-time setup

Prerequisites: Node 22+, Terraform 1.10+, the AWS CLI with admin credentials, and the GitHub CLI.

```bash
npm ci && npm run build -w backend

# 1. Bootstrap: state bucket + GitHub OIDC roles (local state, run once)
cd infra/bootstrap
terraform init
terraform apply -var github_repo=<owner>/<repo>

# 2. Application stack
cd ../envs/prod
echo 'admin_email = "you@example.com"' > terraform.tfvars        # gitignored
terraform init -backend-config="bucket=$(terraform -chdir=../../bootstrap output -raw state_bucket)"
terraform apply

# 3. Frontend
cd ../../..
scripts/deploy-frontend.sh
```

After the apply, check your inbox for:
1. **"AWS Notification - Subscription Confirmation"**: click it so you receive comment and alarm emails.
2. **Your admin account email**, which has a temporary password. Sign in at `<site_url>/admin` and choose a new one.

### Turn on CI/CD

In GitHub, go to **Settings → Environments**, create `production` and restrict it to the `main` branch. Then add:

| Kind | Name | Value |
|---|---|---|
| Variable | `AWS_DEPLOY_ROLE_ARN` | `terraform -chdir=infra/bootstrap output -raw deploy_role_arn` |
| Variable | `AWS_PLAN_ROLE_ARN` | `terraform -chdir=infra/bootstrap output -raw plan_role_arn` |
| Variable | `TF_STATE_BUCKET` | `terraform -chdir=infra/bootstrap output -raw state_bucket` |
| Secret | `ADMIN_EMAIL` | your admin email |

From then on, every push to `main` tests, applies Terraform, builds and deploys. Pull requests get typecheck, tests and a Terraform plan.

## Local development

```bash
scripts/write-config.sh   # point the local frontend at the deployed API
npm run dev               # http://localhost:5173 (already allowed by CORS and Cognito)
npm test                  # backend + frontend unit tests
```

## Migrating from the original console-built blog

```bash
npm run migrate:legacy -w backend -- --dry-run   # preview
npm run migrate:legacy -w backend                # copy posts, comments, views
```

This reads `BlogPosts` and `BlogComments` and writes to the new tables. It never modifies the old ones. The publisher renders the static pages automatically.

## Cost (≈1,000 readers/month)

| Service | Monthly |
|---|---|
| CloudFront, Lambda, Cognito, SNS, CloudWatch | $0 (free tier) |
| API Gateway HTTP API | ~$0.05 |
| DynamoDB on-demand + PITR | ~$0.10–0.30 |
| S3 | ~$0.05 |
| **Total** | **≈ $0.25–0.50** |

Optional: a custom domain adds about $1.50/month (Route 53 zone + domain); ACM certificates are free.
