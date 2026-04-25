"""
Market configuration — open data endpoints, filters, and metadata
for each target market. Add new markets here.
"""

MARKETS = {
    "austin": {
        "display_name": "Austin, TX",
        "state": "TX",
        "timezone": "America/Chicago",
        "open_data": {
            "permits": {
                "url": "https://data.austintexas.gov/resource/3syk-w9eu.json",
                "format": "socrata",
                # VALIDATED 2026-04-09 — returns 1,819 multifamily results
                "filters": {
                    # Filter: Building Permits only, New construction, 5+ units, 2019+
                    "permittype": "BP",
                    "work_class": "New",
                    "$where": "housing_units > 5 AND issue_date > '2019-01-01'",
                    "$limit": 5000,
                    "$order": "issue_date DESC",
                },
                # ACTUAL field names from live API (validated 2026-04-09)
                "field_map": {
                    "permit_number": "permit_number",       # e.g. "2025-131017 BP"
                    "address": "original_address1",          # e.g. "823 TILLERY ST"
                    "city": "original_city",                 # e.g. "AUSTIN"
                    "state": "original_state",               # e.g. "TX"
                    "zip": "original_zip",                   # e.g. "78702"
                    "issued_date": "issue_date",             # ISO 8601
                    "description": "description",            # Full text description
                    "status": "status_current",              # "Active", "Final", etc.
                    "units": "housing_units",                # Unit count (string, needs int cast)
                    "floors": "number_of_floors",            # Floor count
                    "sqft": "total_new_add_sqft",            # Total square footage
                    "latitude": "latitude",                  # Geocoded by city
                    "longitude": "longitude",                # Geocoded by city
                    "contractor": "contractor_company_name", # Developer/GC name
                    "applicant": "applicant_org",            # Applicant org
                    "has_co": "certificate_of_occupancy",    # "Yes"/"No"
                    "permit_class": "permit_class",          # Detailed classification
                    "completed_date": "completed_date",      # Completion date if finished
                },
            },
            "certificates": {
                # NOTE: f9mz-m6dy appears to be the same permits dataset.
                # CO status is tracked via certificate_of_occupancy="Yes" on the
                # permits endpoint + status_current="Final" + completed_date.
                # TODO: Verify if a separate CO/TCO dataset exists on Austin open data.
                "url": "https://data.austintexas.gov/resource/f9mz-m6dy.json",
                "format": "socrata",
                "filters": {
                    "permittype": "BP",
                    "certificate_of_occupancy": "Yes",
                    "$where": "housing_units > 5",
                    "$limit": 5000,
                },
                "field_map": {
                    "permit_number": "permit_number",
                    "address": "original_address1",
                    "issued_date": "issue_date",
                    "has_co": "certificate_of_occupancy",
                    "completed_date": "completed_date",
                },
            },
            "active_mf_permits": {
                "url": "https://data.austintexas.gov/resource/hah9-7x5p.json",
                "format": "socrata",
                "filters": {"$limit": 5000},
                "field_map": {},
            },
        },
    },
    "dfw": {
        "display_name": "Dallas-Fort Worth, TX",
        "state": "TX",
        "timezone": "America/Chicago",
        "open_data": {
            "permits": {
                "url": "https://www.dallasopendata.com/resource/building-permits.json",
                "format": "socrata",
                "filters": {
                    "$where": "work_description LIKE '%MULTI%' OR work_description LIKE '%APART%'",
                    "$limit": 5000,
                },
                "field_map": {
                    "permit_number": "permit_num",
                    "address": "address",
                    "issued_date": "issue_date",
                    "description": "work_description",
                },
            },
        },
    },
    "phoenix": {
        "display_name": "Phoenix, AZ",
        "state": "AZ",
        "timezone": "America/Phoenix",
        "open_data": {
            "permits": {
                "url": "https://phoenixopendata.com/resource/building-permits.json",
                "format": "socrata",
                "filters": {
                    "$where": "permit_type LIKE '%MULTI%' OR permit_type LIKE '%APARTMENT%'",
                    "$limit": 5000,
                },
                "field_map": {
                    "permit_number": "permit_number",
                    "address": "address",
                    "issued_date": "issue_date",
                },
            },
        },
    },
    "denver": {
        "display_name": "Denver, CO",
        "state": "CO",
        "timezone": "America/Denver",
        "open_data": {
            "permits": {
                "url": "https://data.denvergov.org/resource/building-permits.json",
                "format": "socrata",
                "filters": {
                    "$where": "permit_type LIKE '%MULTI%' OR permit_type LIKE '%APARTMENT%'",
                    "$limit": 5000,
                },
                "field_map": {
                    "permit_number": "permit_number",
                    "address": "address",
                    "issued_date": "permit_issued_date",
                },
            },
        },
    },
    "nashville": {
        "display_name": "Nashville, TN",
        "state": "TN",
        "timezone": "America/Chicago",
        "open_data": {
            "permits": {
                "url": "https://data.nashville.gov/resource/building-permits.json",
                "format": "socrata",
                "filters": {
                    "$where": "permit_type LIKE '%MULTI%' OR permit_sub_type LIKE '%APART%'",
                    "$limit": 5000,
                },
                "field_map": {
                    "permit_number": "permit_number",
                    "address": "address",
                    "issued_date": "date_issued",
                },
            },
        },
    },
}

# PMS platforms and their URL patterns for discovery
PMS_PLATFORMS = {
    "rentcafe": {
        "search_patterns": [
            '"{building_name}" site:rentcafe.com',
            '"{address}" site:rentcafe.com',
            '"{building_name}" rentcafe {city}',
        ],
        "url_pattern": r"https?://[a-z0-9-]+\.rentcafe\.com",
        "scraper": "rentcafe",
    },
    "entrata": {
        "search_patterns": [
            '"{building_name}" site:entrata.com',
            '"{building_name}" "schedule a tour" {city}',
        ],
        "url_pattern": r"https?://[a-z0-9-]+\.entrata\.com",
        "scraper": "entrata",
    },
    "realpage": {
        "search_patterns": [
            '"{building_name}" site:onsite.realpage.com',
            '"{building_name}" realpage {city}',
        ],
        "url_pattern": r"https?://[a-z0-9-]+\.onsite\.realpage\.com",
        "scraper": "realpage",
    },
}
