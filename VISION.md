# Cannon+ Vision

## Product identity

Cannon+ is the official strict typed and systems-oriented superset of Cannon.

Its purpose is to extend Cannon into stronger correctness, memory, ABI, embedded, realtime, and safety-critical territory without forcing ordinary Cannon programming to become annotation-heavy systems programming.

## Primary comparison set

Cannon+ is our answer to lessons drawn from:

- TypeScript's compatibility model
- Rust's memory/concurrency safety goals
- C's systems reach and explicit control

Cannon+ is not intended to clone any of them. It should preserve Cannon compatibility wherever practical while adding stronger guarantees and systems capability progressively.

## Strengths to preserve

- Valid Cannon should remain valid Cannon+ wherever possible.
- Nova inference remains available so explicit annotations are used when they add contractual value.
- Strict nullability and checked conversions.
- Stronger mutation rules.
- Native/ABI precision.
- Ownership/lifetime information.
- Arenas/regions and deterministic allocation where appropriate.
- Explicit memory and pointer capabilities.
- Clear `unsafe` boundaries.
- Embedded, realtime, hardened, and safety profiles.

## Weaknesses to eliminate

Cannon+ should pursue strong guarantees without inheriting avoidable costs:

- no unnecessary annotation burden merely to access stronger safety;
- no hostile learning curve as a design goal;
- no false safety claims without positive, negative, leak, lifetime, and use-after-free evidence;
- no needless incompatibility with Cannon;
- no hiding dangerous operations behind convenient syntax.

## Independent ceiling

Cannon+ must be capable of standing as a serious typed/systems language layer for Cannon, including professional, enterprise, embedded, realtime, and safety-oriented use cases.

## Ecosystem role

Cannon+ defines strict/systems language semantics. Nova owns inference, semantic analysis, IR, optimization, diagnostics, and compilation. Parallel executes Cannon/Cannon+ programs. Plasma provides foreign/native boundaries. Cortex exposes first-class editing, debugging, and systems inspection.

## Architectural invariant

**Do not turn Cannon+ into a separate incompatible language, and do not simplify its systems ambition merely to make the broader ecosystem easier to integrate. Its job is to extend Cannon upward into stronger guarantees and deeper control.**
