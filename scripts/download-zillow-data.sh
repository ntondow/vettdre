#!/bin/bash
mkdir -p data/zillow

echo "Downloading Zillow research data..."

# ZHVI - Home Values by ZIP
echo "  Downloading ZHVI (home values)..."
curl -s -o data/zillow/zhvi_zip.csv "https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"

# ZORI - Rent Index by ZIP
echo "  Downloading ZORI (rent index)..."
curl -s -o data/zillow/zori_zip.csv "https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv"

# For Sale Inventory
echo "  Downloading inventory..."
curl -s -o data/zillow/inventory_zip.csv "https://files.zillowstatic.com/research/public_csvs/invt_fs/Zip_invt_fs_uc_sfrcondo_sm_month.csv"

# New Listings
echo "  Downloading new listings..."
curl -s -o data/zillow/new_listings_zip.csv "https://files.zillowstatic.com/research/public_csvs/new_listings/Zip_new_listings_uc_sfrcondo_sm_month.csv"

echo ""
echo "Done! Files:"
ls -lh data/zillow/*.csv 2>/dev/null || echo "  (no files downloaded - check URLs)"
