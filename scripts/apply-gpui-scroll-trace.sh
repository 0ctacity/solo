#!/usr/bin/env bash
# TEMPORARY: apply [gpui-scroll] instrumentation to the pinned GPUI checkout
# (crates/gpui/src/elements/div.rs). Used with GPUIX_SCROLL_TRACE=1 to trace
# the Linux physical-scroll path inside GPUI. See
# scripts/gpui-scroll-trace.patch and examples/tasks/diagnose-scroll.mts.
#
# Usage:
#   bash scripts/apply-gpui-scroll-trace.sh          # apply
#   bash scripts/apply-gpui-scroll-trace.sh revert   # revert
set -euo pipefail

REV="db0820f6756b9d789707a3de01cee72ff5251941"
CHECKOUTS="${CARGO_HOME:-$HOME/.cargo}/git/checkouts"
TARGET=$(ls -d "$CHECKOUTS"/zed-*/* 2>/dev/null | grep -E "/$REV\$|/db0820f$" | head -1 || true)
if [[ -z "${TARGET}" ]]; then
  echo "error: no zed checkout for rev ${REV:0:7} under $CHECKOUTS" >&2
  exit 1
fi
FILE="$TARGET/crates/gpui/src/elements/div.rs"
PATCH="$(cd "$(dirname "$0")" && pwd)/gpui-scroll-trace.patch"

if [[ "${1:-}" == "revert" ]]; then
  if grep -q "gpui-scroll" "$FILE"; then
    patch -p1 -R --directory="$TARGET" < "$PATCH"
    echo "reverted instrumentation from $FILE"
  else
    echo "already clean: $FILE"
  fi
  exit 0
fi

if grep -q "gpui-scroll" "$FILE"; then
  echo "already applied: $FILE"
else
  patch -p1 --directory="$TARGET" < "$PATCH"
  echo "applied instrumentation to $FILE"
fi

# Cargo treats git-checkout sources as immutable and will NOT rebuild on
# content changes; drop its fingerprints for gpui so the next native build
# actually recompiles the instrumented crate.
for pkg_dir in "${CARGO_HOME:-$HOME/.cargo}"/package-cache-lock "$TARGET"/..; do :; done
NATIVE_DIR="$(cd "$(dirname "$0")/../packages/native" 2>/dev/null && pwd)"
if [[ -d "$NATIVE_DIR/target/release/.fingerprint" ]]; then
  rm -rf "$NATIVE_DIR"/target/release/.fingerprint/gpui-* \
         "$NATIVE_DIR"/target/release/.fingerprint/gpuix-native-*
  rm -f  "$NATIVE_DIR"/target/release/libgpuix_native.so
  rm -f  "$NATIVE_DIR"/gpuix-native.linux-x64-gnu.node
  echo "cleared cargo fingerprints for gpui; run 'bun run build:native' next"
fi
echo "revert with: bash scripts/apply-gpui-scroll-trace.sh revert"
