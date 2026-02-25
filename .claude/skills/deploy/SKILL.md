# Deploy Skill
When asked to deploy or ship:
1. Run `npx next build` to verify zero errors
2. Run `npx tsc --noEmit` to verify zero TS errors
3. Run `git add . && git commit -m "<descriptive message>"`
4. Run `git push origin main`
5. Run `gcloud builds submit --config cloudbuild.yaml --region=us-east1`
6. Report the build status

Environment: Google Cloud Run, us-east1, project "vettdre"
