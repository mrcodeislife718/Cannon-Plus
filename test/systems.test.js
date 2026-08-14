import test from 'node:test';
import assert from 'node:assert/strict';
import { parseType, TypeRegistry, checkAssignable, checkedCast, OwnershipTracker, Region, unsafe, RawPointer, defineAbiFunction, plasmaAbiManifest, validateSafetyProfile } from '../src/index.js';

test('types, generics, nullability, and checked conversions are enforced', () => {
  assert.equal(parseType('i32?').kind, 'nullable');
  assert.equal(parseType('*mut u8').kind, 'pointer');
  assert.equal(parseType('List<i32>').kind, 'generic-instance');
  const registry = new TypeRegistry();
  registry.defineStruct('Point', { x: 'i32', y: 'i32' });
  assert.equal(registry.get('Point').fields.x.name, 'i32');
  assert.equal(checkAssignable('i32', 'i64').ok, true);
  assert.equal(checkAssignable('i64', 'i32').ok, false);
  assert.equal(checkedCast(255, 'u8'), 255);
  assert.throws(() => checkedCast(256, 'u8'), RangeError);
});

test('ownership rejects invalid borrows and use after move', () => {
  const ownership = new OwnershipTracker();
  ownership.declare('buffer');
  ownership.borrow('buffer', 'reader');
  assert.throws(() => ownership.borrow('buffer', 'writer', { mutable: true }), /mutably borrow/);
  ownership.releaseBorrow('buffer', 'reader');
  ownership.move('buffer', 'worker');
  assert.throws(() => ownership.use('buffer', 'current'), /use after move/);
  assert.equal(ownership.use('buffer', 'worker'), true);
});

test('regions release allocations deterministically and unsafe gates raw pointers', () => {
  const region = new Region({ capacity: 16 });
  const pointer = region.allocate(8, 42);
  assert.equal(pointer.read(), 42);
  pointer.write(50);
  assert.equal(pointer.read(), 50);
  pointer.release();
  assert.throws(() => pointer.read(), /released/);
  assert.throws(() => new RawPointer(Buffer.alloc(8)), /unsafe boundary/);
  unsafe(() => {
    const raw = new RawPointer(Buffer.alloc(8), 0, 'u32');
    raw.write(123);
    assert.equal(raw.read(), 123);
  });
});

test('Plasma ABI and safety profiles produce deterministic contracts', () => {
  const fn = defineAbiFunction({ name: 'add', parameters: [{ name: 'a', type: 'i32' }], returns: 'i32' });
  const manifest = plasmaAbiManifest('math', [fn]);
  assert.equal(manifest.functions[0].returns, 'i32');
  const result = validateSafetyProfile({ operations: [{ kind: 'unsafe' }] }, 'safety');
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, 'CP-SAFE-001');
});
