-- CreateIndex (conditional unique on propertyId + unit for upsert support)
CREATE UNIQUE INDEX "bms_listings_property_unit_unique" ON "bms_listings"("property_id", "unit") WHERE "property_id" IS NOT NULL AND "unit" IS NOT NULL;
