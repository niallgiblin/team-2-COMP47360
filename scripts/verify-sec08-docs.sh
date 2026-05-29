#!/usr/bin/env bash
# Verifies in-repo SEC-08 documentation deliverables (operator Cloud Console step is separate).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOC="$ROOT/docs/SECURITY.md"

if [[ ! -f "$DOC" ]]; then
  echo "FAIL: docs/SECURITY.md not found"
  exit 1
fi

required_patterns=(
  "VITE_GOOGLE_API_KEY"
  "HTTP referrer"
  "Routes API"
  "API restrictions"
  "Google Maps"
)

missing=0
for pattern in "${required_patterns[@]}"; do
  if ! grep -q "$pattern" "$DOC"; then
    echo "FAIL: missing pattern '$pattern' in docs/SECURITY.md"
    missing=$((missing + 1))
  fi
done

if [[ "$missing" -gt 0 ]]; then
  exit 1
fi

echo "PASS: SEC-08 in-repo documentation verified ($DOC)"
