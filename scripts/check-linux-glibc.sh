#!/usr/bin/env bash
set -euo pipefail

root="${1:?usage: check-linux-glibc.sh <linux-unpacked> <maximum-version>}"
maximum="${2:?usage: check-linux-glibc.sh <linux-unpacked> <maximum-version>}"
versions_file="$(mktemp)"
trap 'rm -f "$versions_file"' EXIT

while IFS= read -r -d '' candidate; do
  if file "$candidate" | grep -q 'ELF'; then
    readelf --version-info "$candidate" 2>/dev/null \
      | grep -oE 'GLIBC_[0-9]+\.[0-9]+' \
      | sed 's/^GLIBC_//' >> "$versions_file" || true
  fi
done < <(find "$root" -type f -print0)

required="$(sort -Vu "$versions_file" | tail -n 1)"
test -n "$required"
if ! dpkg --compare-versions "$required" le "$maximum"; then
  echo "Packaged ELF requires GLIBC_$required, above allowed GLIBC_$maximum" >&2
  exit 1
fi

echo "Packaged ELF maximum requirement: GLIBC_$required (allowed <= GLIBC_$maximum)"
