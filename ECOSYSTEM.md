# Cannon+ ecosystem role

Cannon+ is the official strict typed and systems superset of Cannon: the ecosystem's answer to the need for a TypeScript-like compatibility relationship while going substantially deeper into systems programming.

## Intent

Valid Cannon should remain valid Cannon+ wherever possible. Cannon+ adds explicit types and stronger contracts only where they create real value, while Nova inference remains available to avoid annotation-heavy boilerplate.

Cannon+ owns explicit types, strict nullability, checked conversions, stronger mutation rules, native/ABI precision, ownership information, arenas/regions, deterministic allocation, explicit memory management, pointers, unsafe boundaries, and embedded/realtime/safety-critical profiles.

## Relationships

- Cannon supplies the approachable base language.
- Nova supplies inference, diagnostics, semantic analysis, IR and compilation for Cannon+.
- Parallel executes Cannon/Cannon+ programs.
- Plasma connects Cannon+ systems code to C/C++, Python, Java/JVM, JavaScript/Node, Ruby, PHP, Perl, WASM and native APIs.
- Cortex provides first-class editing, diagnostics, debugging and systems inspection.
- Chronos can provide certified/reproducible toolchains and build evidence for hardened profiles.

Cannon+ remains independently versioned, tested and released. Strict and memory-safety claims require positive/negative compile tests plus executable runtime evidence.
