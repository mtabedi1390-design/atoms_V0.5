cmake_minimum_required(VERSION 3.16)
project(atoms LANGUAGES CXX)

# The numerical core is header-only, platform independent, and has no OpenGL,
# GLFW or GLEW dependency.  It is the single C++ reference for the mathematics
# also implemented in src/physics/*.ts.
add_library(atoms_quantum INTERFACE)
target_include_directories(atoms_quantum INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/native)
target_compile_features(atoms_quantum INTERFACE cxx_std_17)

option(ATOMS_BUILD_NATIVE_VIEWERS "Build the original GLFW/OpenGL desktop viewers" OFF)

enable_testing()
add_executable(quantum_core_test native/tests/quantum_core_test.cpp)
target_link_libraries(quantum_core_test PRIVATE atoms_quantum)
add_executable(quantum_reference_dump native/tests/reference_dump.cpp)
target_link_libraries(quantum_reference_dump PRIVATE atoms_quantum)

# NOTE: no -DNDEBUG rewriting is used.  The test uses its own always-active CHECK
# helper, so Debug and Release have identical semantics.
add_test(NAME quantum_core COMMAND quantum_core_test)
set_tests_properties(quantum_core PROPERTIES LABELS "physics;reference")

if(ATOMS_BUILD_NATIVE_VIEWERS)
  find_package(OpenGL REQUIRED)
  find_package(glfw3 QUIET)
  find_package(GLEW QUIET)
  if(NOT glfw3_FOUND OR NOT GLEW_FOUND)
    message(FATAL_ERROR
      "Native viewers need GLFW3 and GLEW development packages (plus libGL). "
      "Install libglfw3-dev libglew-dev libgl1-mesa-dev, or configure with "
      "-DATOMS_BUILD_NATIVE_VIEWERS=OFF.")
  endif()
  if(NOT EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/native/upstream/CMakeLists.txt)
    message(FATAL_ERROR
      "ATOMS_BUILD_NATIVE_VIEWERS=ON, but native/upstream/ (the retained "
      "kavan010/Atoms GLFW viewers) is not present in this snapshot.  See "
      "native/upstream/README.md.  Configure with OFF to build the verified core.")
  endif()
  add_subdirectory(native/upstream)
endif()
