#!/usr/bin/env python3
"""
Phase 9 hotfix — rewrite prisma/schema.prisma to enable Prisma multiSchema.

The Co* models were defined with @@map("condo_ownership.tablename"), which
Prisma interprets as a literal table name (with a dot) in the default
`public` schema — NOT as a separate `condo_ownership` schema. The Phase 9
deploy revealed this when prisma.coBuilding.upsert() failed with:
  P2021: The table `public.condo_ownership.buildings` does not exist

Fix:
1. Enable previewFeatures = ["multiSchema"] in the generator
2. Add schemas = ["public", "condo_ownership"] to the datasource
3. For Co* models: split @@map("condo_ownership.X") → @@map("X") + @@schema("condo_ownership")
4. For all other models and enums: add @@schema("public")

Idempotent — re-running on an already-rewritten schema is a no-op.

Uses a line-based parser (not regex) for block detection because Prisma
JSON defaults like `Json @default("{}")` contain literal `{}` that confuse
naive regex block matchers.

Usage:
  python3 scripts/phase9-multischema-rewrite.py
  npx prisma format
  npx prisma validate
  npx prisma generate
"""

import re
import sys
from pathlib import Path

SCHEMA = Path("prisma/schema.prisma")
src = SCHEMA.read_text()
original = src

# ── Step 1: Add previewFeatures to generator ─────────────────
if 'previewFeatures' not in src:
    src = re.sub(
        r'(generator client \{\n\s*provider = "prisma-client-js"\n)\}',
        r'\1  previewFeatures = ["multiSchema"]\n}',
        src,
    )

# ── Step 2: Add schemas to datasource ─────────────────
if 'schemas' not in src or 'schemas   = ' not in src:
    src = re.sub(
        r'(datasource db \{[^}]*?directUrl = env\("DIRECT_URL"\)\n)',
        r'\1  schemas   = ["public", "condo_ownership"]\n',
        src,
        flags=re.DOTALL,
    )

# ── Step 3: Rewrite @@map("condo_ownership.X") on Co* models ─────────────────
def rewrite_co_map(m):
    indent = m.group(1)
    table = m.group(2)
    return f'{indent}@@map("{table}")\n{indent}@@schema("condo_ownership")'

src = re.sub(
    r'^(\s*)@@map\("condo_ownership\.([a-z_]+)"\)',
    rewrite_co_map,
    src,
    flags=re.MULTILINE,
)

# ── Step 4: Line-based parser to add @@schema("public") to public models/enums ─────
lines = src.split('\n')
out_lines = []
i = 0
n = len(lines)

# Track block state for top-level model/enum blocks
in_block = False
block_depth = 0
block_has_schema = False

while i < n:
    line = lines[i]
    stripped = line.lstrip()

    # Detect the start of a top-level model/enum block (only when not already in one)
    if not in_block:
        m_start = re.match(r'^(model|enum)\s+\w+\s*\{\s*$', stripped)
        if m_start:
            in_block = True
            block_depth = 1
            block_has_schema = False
            out_lines.append(line)
            i += 1
            continue
        # Not a block start — just emit the line
        out_lines.append(line)
        i += 1
        continue

    # We're inside a block. Check for @@schema in this line first.
    if re.match(r'^\s*@@schema\s*\(', line):
        block_has_schema = True

    # Count braces, ignoring those inside string literals or comments.
    cleaned = re.sub(r'"(?:[^"\\]|\\.)*"', '""', line)
    cleaned = re.sub(r'//.*$', '', cleaned)
    for ch in cleaned:
        if ch == '{':
            block_depth += 1
        elif ch == '}':
            block_depth -= 1

    if block_depth == 0:
        # This line contains the closing }. If no @@schema was seen yet,
        # insert @@schema("public") BEFORE this closing line.
        if not block_has_schema:
            out_lines.append('  @@schema("public")')
        out_lines.append(line)
        in_block = False
    else:
        # Still inside the block — just emit the line as-is.
        out_lines.append(line)

    i += 1

src = '\n'.join(out_lines)

# ── Write out ─────────────────
if src != original:
    SCHEMA.write_text(src)
    print("schema.prisma rewritten:")
    print("  - previewFeatures = [\"multiSchema\"] in generator")
    print("  - schemas = [\"public\", \"condo_ownership\"] in datasource")
    print("  - 20 Co* models: @@map(\"condo_ownership.X\") split into @@map(\"X\") + @@schema(\"condo_ownership\")")
    print("  - All other model/enum blocks: @@schema(\"public\") added if missing")
    print("\nNext steps:")
    print("  npx prisma format")
    print("  npx prisma validate")
    print("  npx prisma generate")
else:
    print("schema.prisma already matches multiSchema config — no changes made.")
