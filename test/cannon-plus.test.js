import test from 'node:test';
import assert from 'node:assert/strict';
import { check, transform } from '../src/index.js';

test('Cannon+ accepts ordinary Cannon syntax unchanged', () => {
  const source = 'name = "Charles"\nprint(name)';
  assert.equal(transform(source).code, source);
});

test('Cannon+ lowers typed declarations to Cannon', () => {
  const source = 'name: string = "Charles"\nage: i32 = 44';
  const result = transform(source);
  assert.equal(result.code, 'name = "Charles"\nage = 44');
  assert.deepEqual(result.types, { name: 'string', age: 'i32' });
});

test('Cannon+ lowers typed function signatures', () => {
  const source = 'fn add(a: i32, b: i32) -> i32 {\n  return a + b\n}';
  assert.equal(transform(source).code, 'fn add(a, b) {\n  return a + b\n}');
});

test('Cannon+ rejects incompatible literal assignments', () => {
  assert.throws(() => check('age: i32 = "forty four"'), /Type mismatch/);
});

test('Cannon+ preserves type contract on later literal reassignment', () => {
  assert.throws(() => check('age: i32 = 44\nage = "old"'), /Type mismatch/);
});
