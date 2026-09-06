import test from 'node:test';
import assert from 'node:assert/strict';
import { OwnershipTracker } from '../src/index.js';

test('Cannon+ ownership always enforces the current owner', () => {
  const ownership = new OwnershipTracker();
  ownership.declare('buffer', { owner: 'main' });
  assert.equal(ownership.use('buffer', 'main'), true);
  assert.throws(() => ownership.use('buffer', 'worker'), /ownership violation/);
});

test('Cannon+ moved values remain live for the new owner', () => {
  const ownership = new OwnershipTracker();
  ownership.declare('buffer', { owner: 'main' });
  ownership.move('buffer', 'worker-a');
  assert.throws(() => ownership.use('buffer', 'main'), /use after move/);
  assert.equal(ownership.use('buffer', 'worker-a'), true);
  ownership.borrow('buffer', 'reader');
  assert.equal(ownership.releaseBorrow('buffer', 'reader'), true);
  const secondMove = ownership.move('buffer', 'worker-b');
  assert.equal(secondMove.owner, 'worker-b');
  assert.equal(secondMove.generation, 2);
  assert.deepEqual(secondMove.previousOwners, ['main', 'worker-a']);
  assert.equal(ownership.use('buffer', 'worker-b'), true);
  assert.throws(() => ownership.use('buffer', 'worker-a'), /use after move/);
});

test('Cannon+ refuses ownership transfer while borrows are live', () => {
  const ownership = new OwnershipTracker();
  ownership.declare('buffer');
  ownership.borrow('buffer', 'reader');
  assert.throws(() => ownership.move('buffer', 'worker'), /while borrowed/);
});
