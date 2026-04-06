#!/bin/bash
# ============================================================
# Terminal Pipeline — Google Cloud Scheduler Setup
#
# Creates (or updates) 5 Cloud Scheduler jobs that drive the
# Terminal ingestion pipeline + existing cron endpoints.
#
# Prerequisites:
#   gcloud auth login
#   gcloud config set project vettdre
#
# Usage:
#   bash scripts/terminal-scheduler-setup.sh          # create jobs
#   bash scripts/terminal-scheduler-setup.sh --update  # update existing jobs
#   bash scripts/terminal-scheduler-setup.sh --delete  # delete all jobs
#
# Schedule overview (all Eastern Time):
#   terminal-ingest          */15 * * * *   Poll NYC Open Data (15m)
#   terminal-enrich          5,20,35,50 * * * *   Enrich events (+5m offset)
#   terminal-generate-briefs */5 * * * *    AI briefs (every 5m — runs more often
#                                           because brief gen is the bottleneck;
#                                           parallelized batches of 5 in route.ts)
#   automations-cron         */30 * * * *   CRM automations (30m)
#   leasing-follow-ups       */15 * * * *   Leasing follow-ups (15m)
#
# Verify jobs are deployed:
#   gcloud scheduler jobs list --location=us-east1 --project=vettdre
# ============================================================

set -euo pipefail

PROJECT="vettdre"
REGION="us-east1"
LOCATION="us-east1"
TIMEZONE="America/New_York"

# ── Resolve Cloud Run service URL ────────────────────────────

echo "Resolving Cloud Run service URL..."
SERVICE_URL=$(gcloud run services describe vettdre \
  --region="$REGION" \
  --project="$PROJECT" \
  --format="value(status.url)" 2>/dev/null)

if [ -z "$SERVICE_URL" ]; then
  echo "ERROR: Could not resolve Cloud Run service URL."
  echo "Make sure 'vettdre' is deployed: gcloud run services list --project=$PROJECT"
  exit 1
fi
echo "  Service URL: $SERVICE_URL"

# ── Resolve CRON_SECRET from Secret Manager ──────────────────

echo "Retrieving CRON_SECRET from Secret Manager..."
CRON_SECRET=$(gcloud secrets versions access latest \
  --secret="CRON_SECRET" \
  --project="$PROJECT" 2>/dev/null)

if [ -z "$CRON_SECRET" ]; then
  echo "ERROR: Could not retrieve CRON_SECRET."
  echo "Create it first: bash scripts/create-secrets.sh"
  exit 1
fi
echo "  CRON_SECRET retrieved (${#CRON_SECRET} chars)"

# ── Job definitions ──────────────────────────────────────────

# Args: name, schedule, path, deadline_seconds
declare -a JOBS=(
  "terminal-ingest|*/15 * * * *|/api/terminal/ingest|300"
  "terminal-enrich|5,20,35,50 * * * *|/api/terminal/enrich|300"
  "terminal-generate-briefs|*/5 * * * *|/api/terminal/generate-briefs|300"
  "automations-cron|*/30 * * * *|/api/automations/cron|60"
  "leasing-follow-ups|*/15 * * * *|/api/leasing/follow-ups|60"
)

# ── Determine action (create, update, or delete) ────────────

ACTION="create"
if [ "${1:-}" = "--update" ]; then
  ACTION="update"
elif [ "${1:-}" = "--delete" ]; then
  ACTION="delete"
fi

echo ""
echo "Action: $ACTION"
echo "========================================="

# ── Create / Update / Delete jobs ────────────────────────────

for job_def in "${JOBS[@]}"; do
  IFS='|' read -r NAME SCHEDULE PATH DEADLINE <<< "$job_def"
  URI="${SERVICE_URL}${PATH}"

  echo ""
  echo "[$NAME]"
  echo "  Schedule: $SCHEDULE"
  echo "  URI:      $URI"
  echo "  Deadline: ${DEADLINE}s"

  if [ "$ACTION" = "delete" ]; then
    if gcloud scheduler jobs delete "$NAME" \
      --location="$LOCATION" \
      --project="$PROJECT" \
      --quiet 2>/dev/null; then
      echo "  DELETED"
    else
      echo "  (not found, skipping)"
    fi
    continue
  fi

  # Try create first; if it already exists, update instead
  if [ "$ACTION" = "create" ]; then
    if gcloud scheduler jobs create http "$NAME" \
      --schedule="$SCHEDULE" \
      --uri="$URI" \
      --http-method=GET \
      --headers="Authorization=Bearer $CRON_SECRET" \
      --time-zone="$TIMEZONE" \
      --attempt-deadline="${DEADLINE}s" \
      --location="$LOCATION" \
      --project="$PROJECT" 2>/dev/null; then
      echo "  CREATED"
    else
      echo "  Already exists — updating..."
      gcloud scheduler jobs update http "$NAME" \
        --schedule="$SCHEDULE" \
        --uri="$URI" \
        --http-method=GET \
        --headers="Authorization=Bearer $CRON_SECRET" \
        --time-zone="$TIMEZONE" \
        --attempt-deadline="${DEADLINE}s" \
        --location="$LOCATION" \
        --project="$PROJECT"
      echo "  UPDATED"
    fi
  else
    # Explicit --update flag — try update, fall back to create if job doesn't exist
    if gcloud scheduler jobs update http "$NAME" \
      --schedule="$SCHEDULE" \
      --uri="$URI" \
      --http-method=GET \
      --headers="Authorization=Bearer $CRON_SECRET" \
      --time-zone="$TIMEZONE" \
      --attempt-deadline="${DEADLINE}s" \
      --location="$LOCATION" \
      --project="$PROJECT" 2>/dev/null; then
      echo "  UPDATED"
    else
      echo "  Not found — creating..."
      gcloud scheduler jobs create http "$NAME" \
        --schedule="$SCHEDULE" \
        --uri="$URI" \
        --http-method=GET \
        --headers="Authorization=Bearer $CRON_SECRET" \
        --time-zone="$TIMEZONE" \
        --attempt-deadline="${DEADLINE}s" \
        --location="$LOCATION" \
        --project="$PROJECT"
      echo "  CREATED"
    fi
  fi
done

# ── List all jobs ────────────────────────────────────────────

echo ""
echo "========================================="
echo "Current Cloud Scheduler jobs:"
echo ""
gcloud scheduler jobs list \
  --location="$LOCATION" \
  --project="$PROJECT" \
  --format="table(name.basename(), schedule, state, httpTarget.uri)"

echo ""
echo "Done! To trigger a job manually:"
echo "  gcloud scheduler jobs run terminal-ingest --location=$LOCATION --project=$PROJECT"
echo ""
echo "To run the one-time backfill (30 days):"
echo "  curl -X POST '${SERVICE_URL}/api/terminal/backfill' \\"
echo "    -H 'Authorization: Bearer <CRON_SECRET>' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"orgId\": \"YOUR_ORG_ID\", \"daysBack\": 30}'"
