import test from 'node:test';
import assert from 'node:assert/strict';
import { transform, CannonPlusError } from '../src/index.js';

test('nullable systems types are accepted in source declarations', () => {
  const result = transform('let value: i32? = null\nvalue = 4');
  assert.equal(result.types.value, 'i32?');
  assert.match(result.code, /let value = null/);
});

test('pointer annotations lower without changing Cannon runtime syntax', () => {
  const result = transform('fn inspect(ptr: *const u8) -> void {\n  print(1)\n}');
  assert.match(result.code, /fn inspect\(ptr\)/);
});

test('non-nullable values reject null', () => {
  assert.throws(() => transform('let value: i32 = null'), (error) => {
    assert.ok(error instanceof CannonPlusError);
    assert.match(error.message, /Type mismatch/);
    return true;
  });
});

test('widening integer assignments remain allowed', () => {
  const result = transform('let value: i64 = 4\nvalue = 5');
  assert.equal(result.types.value, 'i64');
});
