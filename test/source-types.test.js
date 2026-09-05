import test from 'node:test';
import assert from 'node:assert/strict';
import { transform, CannonPlusError } from '../src/index.js';

test('Cannon+ lowers source-level aliases without leaking type declarations into Cannon', () => {
  const result = transform(`
type UserId = u64
let id: UserId = 42
`);
  assert.equal(result.definitions.UserId.kind, 'alias');
  assert.equal(result.types.id, 'UserId');
  assert.doesNotMatch(result.code, /type UserId/);
  assert.match(result.code, /let id = 42/);
});

test('Cannon+ supports multiline structural type definitions', () => {
  const result = transform(`
struct User {
  id: u64
  name: string
  nickname: string?
}
let user: User = buildUser()
`);
  assert.equal(result.definitions.User.kind, 'struct');
  assert.deepEqual(Object.keys(result.definitions.User.fields), ['id', 'name', 'nickname']);
  assert.equal(result.types.user, 'User');
  assert.doesNotMatch(result.code, /struct User/);
});

test('Cannon+ supports generic struct annotations when arity and argument types are valid', () => {
  const result = transform(`
struct Box<T> {
  value: T
}
let value: Box<string> = makeBox()
`);
  assert.deepEqual(result.definitions.Box.generics, ['T']);
  assert.equal(result.types.value, 'Box<string>');
});

test('Cannon+ rejects unknown types in structural fields', () => {
  assert.throws(
    () => transform('struct Broken { value: MissingType }'),
    (error) => error instanceof CannonPlusError && /Invalid field/.test(error.message)
  );
});

test('Cannon+ rejects generic arity mismatches', () => {
  assert.throws(
    () => transform('struct Pair<A, B> { first: A, second: B }\nlet pair: Pair<string> = makePair()'),
    /Unknown Cannon\+ type 'Pair<string>'/
  );
});

test('Cannon+ preserves async Cannon syntax while erasing type annotations', () => {
  const result = transform('async fn load(id: u64) -> string { return await fetchName(id) }');
  assert.equal(result.code, 'async fn load(id) { return await fetchName(id) }');
});
