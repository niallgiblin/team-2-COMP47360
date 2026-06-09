#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"

echo "Delegating to scripts/run-tests.sh."
echo "See docs/TESTING.md for the current inventory and dated known failures."

exec bash "$root/scripts/run-tests.sh"
