#!/usr/bin/env bash
# Reproducible native core build + test in Debug and Release.  The test target uses
# an always-active CHECK helper (no NDEBUG-dependent assert).
# Uses CMake/CTest when available, and falls back to direct g++/clang++ compilation
# with identical C++17 Debug/Release flags when CMake is not installed.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

if command -v cmake >/dev/null 2>&1; then
  for cfg in Debug Release; do
    cmake -S . -B "build-core-$cfg" -DATOMS_BUILD_NATIVE_VIEWERS=OFF -DCMAKE_BUILD_TYPE="$cfg"
    cmake --build "build-core-$cfg" --parallel
    ctest --test-dir "build-core-$cfg" --output-on-failure
  done
else
  CXX_BIN="${CXX:-g++}"
  if ! command -v "$CXX_BIN" >/dev/null 2>&1; then
    echo "Neither cmake nor $CXX_BIN found; cannot build native reference core." >&2
    exit 1
  fi
  echo "cmake not found; falling back to direct $CXX_BIN C++17 Debug and Release builds"
  for cfg in Debug Release; do
    dir="build-core-$cfg"
    mkdir -p "$dir"
    if [ "$cfg" = "Debug" ]; then
      flags=(-std=c++17 -O0 -g -Wall -Wextra)
    else
      flags=(-std=c++17 -O2 -DNDEBUG -Wall -Wextra)
    fi
    echo "==> Building $dir ($CXX_BIN ${flags[*]})"
    "$CXX_BIN" "${flags[@]}" -Inative native/tests/quantum_core_test.cpp -o "$dir/quantum_core_test"
    "$CXX_BIN" "${flags[@]}" -Inative native/tests/reference_dump.cpp -o "$dir/quantum_reference_dump"
    "./$dir/quantum_core_test"
  done
fi
