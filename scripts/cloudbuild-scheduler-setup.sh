#!/usr/bin/env bash
#
# Cloud Scheduler setup — idempotent create-or-update of all VettdRE cron jobs.
#
# Run locally after a Cloud Run deploy when any new scheduler job has been
# added or an existing schedule changed. Was previously inline in
# cloudbuild.yaml but moved out due to repeated build-time issues with the
# cloud-sdk image (PATH shadowing, permissions, etc.).
#
# Requires:
#   - gcloud authenticated as a user/SA with Cloud Scheduler Admin role
#   - PROJECT_ID env var (defaults to vettdre)
#   - REGION env var (defaults to us-east1)
#
# Usage:
#   bash scripts/cloudbuild-scheduler-setup.sh
#   PROJECT_ID=other REGION=us-central1 bash scripts/cloudbuild-scheduler-setup.sh

set -euo pipefail

PROJECT="${PROJECT_ID:-vettdre}"
REGION="${REGION:-us-east1}"

echo "Project: $PROJECT"
echo "Region:  $REGION"
echo

SERVICE_URL=$(gcloud run services describe vettdre \
  --region="$REGION" \
  --project="$PROJECT" \
  --format="value(status.url)")

if [ -z "$SERVICE_URL" ]; then
  echo "ERROR: could not resolve Cloud Run service URL for vettdre" >&2
  exit 1
fi

echo "Service URL: $SERVICE_URL"

CRON_SECRET_VAL=$(gcloud secrets versions access latest \
  --secret=CRON_SECRET \
  --project="$PROJECT")

if [ -z "$CRON_SECRET_VAL" ]; then
  echo "ERROR: could not fetch CRON_SECRET secret" >&2
  exit 1
fi

# job_name|schedule|path|deadline_seconds
JOBS=(
  "terminal-ingest|*/15 * * * *|/api/terminal/ingest|300"
  "terminal-enrich|5,20,35,50 * * * *|/api/terminal/enrich|300"
  "terminal-generate-briefs|*/5 * * * *|/api/terminal/generate-briefs|300"
  "automations-cron|*/30 * * * *|/api/automations/cron|60"
  "leasing-follow-ups|*/15 * * * *|/api/leasing/follow-ups|60"
  "intel-condo-units-refresh|0 8 * * 0|/api/intel/condo-units-refresh|300"
  "intel-acris-sync|0 9 * * *|/api/intel/acris-sync|300"
  "intel-hpd-mdr-sync|0 10 * * *|/api/intel/hpd-mdr-sync|300"
  "intel-exemptions-refresh|0 11 * * 0|/api/intel/exemptions-refresh|300"
  "intel-tax-liens-sync|0 12 1 * *|/api/intel/tax-liens-sync|300"
  "intel-nys-corps-sync|0 13 * * 0|/api/intel/nys-corps-sync|300"
  "intel-ofac-sync|0 14 * * 1|/api/intel/ofac-sync|300"
  "intel-resolve-edges|0 2 * * *|/api/intel/resolve-edges|300"
  "intel-mortgage-sync|0 5 * * *|/api/intel/mortgage-sync|300"
  "intel-distress-recompute|0 6 * * 0|/api/intel/distress-recompute|300"
  "intel-building-signals|0 7 * * *|/api/intel/building-signals-recompute|300"
)

for job_def in "${JOBS[@]}"; do
  # NOTE: don't name this var PATH — it would shadow the executable search PATH
  IFS='|' read -r NAME SCHEDULE URL_PATH DEADLINE <<< "$job_def"
  URI="${SERVICE_URL}${URL_PATH}"
  echo "Ensuring scheduler job: $NAME → $URI"

  if gcloud scheduler jobs describe "$NAME" \
       --location="$REGION" \
       --project="$PROJECT" \
       >/dev/null 2>&1; then
    # update-http uses --update-headers (not --headers — that's create-only)
    gcloud scheduler jobs update http "$NAME" \
      --schedule="$SCHEDULE" \
      --uri="$URI" \
      --http-method=GET \
      --update-headers="Authorization=Bearer $CRON_SECRET_VAL" \
      --time-zone="America/New_York" \
      --attempt-deadline="${DEADLINE}s" \
      --location="$REGION" \
      --project="$PROJECT"
  else
    gcloud scheduler jobs create http "$NAME" \
      --schedule="$SCHEDULE" \
      --uri="$URI" \
      --http-method=GET \
      --headers="Authorization=Bearer $CRON_SECRET_VAL" \
      --time-zone="America/New_York" \
      --attempt-deadline="${DEADLINE}s" \
      --location="$REGION" \
      --project="$PROJECT"
  fi
done

echo
echo "All Cloud Scheduler jobs verified (16 total — 5 Terminal + 11 intel)."
