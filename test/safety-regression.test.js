import test from 'node:test';
import assert from 'node:assert/strict';
import {
  check,
  checkAssignable,
  checkedCast,
  OwnershipTracker,
  Region,
  RawPointer,
  unsafe,
  validateSafetyProfile
} from '../src/index.js';

test('negative compile matrix rejects unknown types and incompatible literals with exact locations', () => {
  const cases = [
    { source: 'let x: Missing = 1', pattern: /Unknown Cannon\+ type 'Missing'/, line: 1 },
    { source: 'let x: i32 = "bad"', pattern: /Type mismatch/, line: 1 },
    { source: 'fn f(x: Missing) -> i32 {\n return 1\n}', pattern: /Unknown Cannon\+ type 'Missing'/, line: 1 },
    { source: 'fn f(x: i32) -> Missing {\n return x\n}', pattern: /Unknown Cannon\+ return type 'Missing'/, line: 1 }
  ];
  for (const entry of cases) {
    assert.throws(() => check(entry.source), (error) => {
      assert.match(error.message, entry.pattern);
      assert.equal(error.line, entry.line);
      assert.ok(Number.isInteger(error.column) && error.column > 0);
      return true;
    });
  }
});

test('strict nullability and checked numeric conversions reject implicit unsafe coercion', () => {
  assert.equal(checkAssignable('i32?', 'i32').ok, false);
  assert.match(checkAssignable('i32?', 'i32').reason, /nullable/);
  assert.equal(checkAssignable('i64', 'i32').ok, false);
  assert.equal(checkAssignable('i64', 'i32', { explicit: true }).ok, true);
  assert.throws(() => checkedCast(-1, 'u8'), RangeError);
  assert.throws(() => checkedCast(128, 'i8'), RangeError);
  assert.throws(() => checkedCast(1.25, 'i32'), RangeError);
});

test('ownership regression matrix rejects mutable aliasing, move while borrowed, and use after move', () => {
  const ownership = new OwnershipTracker();
  ownership.declare('value');
  ownership.borrow('value', 'reader-a');
  ownership.borrow('value', 'reader-b');
  assert.throws(() => ownership.borrow('value', 'writer', { mutable: true }), /mutably borrow/);
  assert.throws(() => ownership.move('value', 'worker'), /while borrowed/);
  ownership.releaseBorrow('value', 'reader-a');
  ownership.releaseBorrow('value', 'reader-b');
  ownership.move('value', 'worker');
  assert.throws(() => ownership.borrow('value', 'late-reader'), /was moved/);
  assert.throws(() => ownership.use('value', 'current'), /use after move/);
  assert.equal(ownership.use('value', 'worker'), true);
});

test('regions detect capacity failure, double release, use after free, and use after region close', () => {
  const region = new Region({ name: 'proof', capacity: 8 });
  const pointer = region.allocate(8, 7);
  assert.throws(() => region.allocate(1, 8), /capacity exceeded/);
  assert.equal(pointer.read(), 7);
  pointer.release();
  assert.throws(() => pointer.release(), /released/);
  assert.throws(() => pointer.read(), /released/);

  const region2 = new Region({ name: 'close-proof', capacity: 16 });
  const stale = region2.allocate(4, 99);
  const before = region2.snapshot();
  assert.equal(before.used, 4);
  assert.equal(before.allocations.filter((entry) => !entry.released).length, 1);
  region2.close();
  assert.equal(region2.snapshot().used, 0);
  assert.throws(() => stale.read(), /released region allocation/);
  assert.throws(() => region2.allocate(1), /closed/);
});

test('unsafe boundary never leaks across exceptions and raw pointers cannot escape into safe execution', () => {
  const bytes = Buffer.alloc(8);
  assert.throws(() => new RawPointer(bytes), /unsafe boundary/);
  assert.throws(() => unsafe(() => {
    const pointer = new RawPointer(bytes, 0, 'u32');
    pointer.write(42);
    throw new Error('abort unsafe scope');
  }), /abort unsafe scope/);
  assert.throws(() => new RawPointer(bytes), /unsafe boundary/);
  assert.throws(() => unsafe(() => {
    const pointer = new RawPointer(bytes, 0, 'u32');
    return () => pointer.read();
  })(), /unsafe boundary/);
});

test('embedded realtime and safety profiles deterministically reject forbidden operations', () => {
  const safety = validateSafetyProfile({ operations: [
    { kind: 'unsafe' },
    { kind: 'blocking-io' },
    { kind: 'allocate', phase: 'runtime' },
    { kind: 'loop' }
  ] }, 'safety');
  assert.equal(safety.ok, false);
  assert.deepEqual(safety.issues.map((issue) => issue.code), ['CP-SAFE-001','CP-SAFE-002','CP-SAFE-003','CP-SAFE-004']);

  const realtime = validateSafetyProfile({ operations: [
    { kind: 'blocking-io' },
    { kind: 'allocate', phase: 'runtime' }
  ] }, 'realtime');
  assert.equal(realtime.ok, false);
  assert.deepEqual(realtime.issues.map((issue) => issue.code), ['CP-SAFE-002','CP-SAFE-003']);
});
