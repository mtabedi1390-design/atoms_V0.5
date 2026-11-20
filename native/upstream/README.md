# Retained native viewers — not present in this workspace snapshot

The upstream project [kavan010/Atoms](https://github.com/kavan010/Atoms) (commit
`5c4283a`) ships `src/atom_realtime.cpp`, `src/atom_raytracer.cpp`, `src/atom.cpp`,
`src/wave_atom_2d.cpp`, `src/mesh.json` and pre-built Windows binaries. That repository
has **no LICENSE file**, so these files are not copied or redistributed in this snapshot.

The platform-independent mathematics they contained has been re-implemented, audited and
corrected in `native/quantum_core.hpp` and `src/physics/*.ts`. The desktop viewers can be
restored locally from upstream by their author (or with their permission) into this
directory; `CMakeLists.txt` will build them when `-DATOMS_BUILD_NATIVE_VIEWERS=ON` and the
GLFW3/GLEW/OpenGL development packages are available.

Status in this environment: **viewer sources absent ⇒ native viewer build not attempted**.
The numerical core builds and tests independently of any OpenGL dependency.
