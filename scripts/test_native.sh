#!/usr/bin/env bash
# Reproducible native core build + CTest in Debug and Release.  The test target uses
# an always-active CHECK helper (no NDEBUG-dependent assert).
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
for cfg in Debug Release; do
  cmake -S . -B "build-core-$cfg" -DATOMS_BUILD_NATIVE_VIEWERS=OFF -DCMAKE_BUILD_TYPE=$cfg
  cmake --build "build-core-$cfg" --parallel
  ctest --test-dir "build-core-$cfg" --output-on-failure
done
