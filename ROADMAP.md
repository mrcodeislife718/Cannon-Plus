# Cannon+ Roadmap

Cannon+ is the official strict/systems superset of Cannon.

## Product contract

Valid Cannon should remain valid Cannon+ wherever possible. Cannon+ adds explicit types, stronger compile-time guarantees, strict nullability, checked conversions, stronger mutation rules, native/ABI precision, ownership information, arenas/regions, explicit memory management, pointers, unsafe boundaries, and safety-critical profiles without forcing those concepts into ordinary Cannon.

## Design direction

Cannon+ takes the compatibility lesson from TypeScript, the systems control of C, and the memory/concurrency safety goals of Rust while avoiding annotation-heavy boilerplate and a hostile learning curve. Nova inference remains active so explicit declarations are required only when they add real contractual value.

## Implementation order

1. Typed declarations and function signatures.
2. Structural/user-defined types and generics only where they materially improve safety.
3. Nullability and checked conversions.
4. Ownership/lifetime metadata and diagnostics.
5. Arenas/regions and deterministic allocation.
6. Explicit pointers and `unsafe` boundaries.
7. Native ABI/Plasma integration.
8. Embedded, realtime, and safety profiles.

## Proof gates

Each strict rule requires positive and negative compile tests. Memory features require leak/lifetime/use-after-free tests and runtime verification. Safety profiles require deterministic rule sets and regression suites.

## Commercial boundary

Cannon+ language support should remain broadly accessible. Revenue can come from certified safety profiles, enterprise toolchains, hardened runtimes, compliance evidence, support, and Cortex/Nova enterprise features.
