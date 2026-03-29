#!/bin/sh

echo "Running Prisma migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma || echo "WARNING: Prisma migrations failed (non-fatal), continuing startup..."
echo "Migrations step complete."

echo "Starting Next.js server..."
exec node server.js
