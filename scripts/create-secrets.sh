#!/bin/bash
# Create Google Cloud Secret Manager secrets from .env file
# Run from project root: bash scripts/create-secrets.sh

ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env file not found in current directory"
  exit 1
fi

echo "Creating secrets in Google Cloud Secret Manager..."
echo "Project: $(gcloud config get-value project)"
echo ""

while IFS= read -r line; do
  # Skip comments and blank lines
  [[ "$line" =~ ^#.*$ ]] && continue
  [[ -z "$line" ]] && continue

  # Split on first = sign
  KEY="${line%%=*}"
  VALUE="${line#*=}"

  # Skip if no key
  [[ -z "$KEY" ]] && continue

  # Remove surrounding quotes from value if present
  VALUE="${VALUE%\"}"
  VALUE="${VALUE#\"}"
  VALUE="${VALUE%\'}"
  VALUE="${VALUE#\'}"

  echo -n "Creating secret: $KEY ... "

  # Check if secret already exists
  if gcloud secrets describe "$KEY" &>/dev/null; then
    # Update existing secret with new version
    echo -n "$VALUE" | gcloud secrets versions add "$KEY" --data-file=- 2>/dev/null
    echo "UPDATED"
  else
    # Create new secret
    echo -n "$VALUE" | gcloud secrets create "$KEY" --replication-policy="automatic" --data-file=- 2>/dev/null
    echo "CREATED"
  fi

done < "$ENV_FILE"

echo ""
echo "Done! Verify with: gcloud secrets list"
