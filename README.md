# Cannon+

Cannon+ is the official strict typed and systems superset of Cannon.

Its relationship to Cannon is intentionally similar to the compatibility lesson of TypeScript and JavaScript, but Cannon+ goes deeper into systems programming: explicit types where they add contractual value, strict nullability, checked conversions, stronger mutation rules, native/ABI precision, ownership information, arenas/regions, deterministic allocation, explicit memory management, pointers, `unsafe` boundaries, and embedded/realtime/safety profiles.

## Compatibility contract

Valid Cannon should remain valid Cannon+ wherever possible. Nova inference remains active so developers do not have to annotate everything merely to use the stricter language.

## Role in the ecosystem

```text
Cannon ──► Cannon+
             │
             ▼
            Nova
             │
      ┌──────┴──────┐
      ▼             ▼
   Parallel       Plasma
      │             │
      └──────► applications
```

- **Nova** owns inference, diagnostics, semantic analysis, IR, optimization, and compilation.
- **Parallel** executes Cannon/Cannon+ programs.
- **Plasma** connects systems code to C/C++, Python, Java/JVM, JavaScript/Node, Ruby, PHP, Perl, WASM, and native APIs.
- **Cortex** provides first-class editing, diagnostics, debugging, and systems inspection.
- **Chronos** can provide reproducible/certified builds and evidence for hardened profiles.

## Design direction

Cannon+ draws from TypeScript's compatibility model, C's systems control, and Rust's memory/concurrency safety goals while deliberately avoiding annotation-heavy boilerplate and a hostile learning curve.

## Proof standard

Strict rules require positive and negative compile tests. Memory features require runtime verification for leaks, lifetime errors, and use-after-free behavior. Safety profiles require deterministic rule sets and regression suites.

## Commercial boundary

Language support should remain broadly accessible. Revenue can come from certified safety profiles, enterprise toolchains, hardened runtimes, compliance evidence, support, and Cortex/Nova enterprise features.

See [ECOSYSTEM.md](./ECOSYSTEM.md) and [ROADMAP.md](./ROADMAP.md).
