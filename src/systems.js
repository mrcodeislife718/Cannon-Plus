import crypto from 'node:crypto';

export const BuiltinType = Object.freeze({
  bool: { kind: 'bool', bits: 1 },
  i8: { kind: 'int', signed: true, bits: 8 }, i16: { kind: 'int', signed: true, bits: 16 }, i32: { kind: 'int', signed: true, bits: 32 }, i64: { kind: 'int', signed: true, bits: 64 },
  u8: { kind: 'int', signed: false, bits: 8 }, u16: { kind: 'int', signed: false, bits: 16 }, u32: { kind: 'int', signed: false, bits: 32 }, u64: { kind: 'int', signed: false, bits: 64 },
  f32: { kind: 'float', bits: 32 }, f64: { kind: 'float', bits: 64 }, string: { kind: 'string' }, void: { kind: 'void' }
});

export function parseType(text) {
  const value = text.trim();
  if (BuiltinType[value]) return { name: value, ...BuiltinType[value] };
  if (value.endsWith('?')) return { kind: 'nullable', inner: parseType(value.slice(0, -1)) };
  const pointer = value.match(/^\*(const|mut)?\s*(.+)$/);
  if (pointer) return { kind: 'pointer', mutable: pointer[1] === 'mut', to: parseType(pointer[2]) };
  const generic = value.match(/^([A-Za-z_][\w]*)<(.+)>$/);
  if (generic) return { kind: 'generic-instance', name: generic[1], args: splitTypeArgs(generic[2]).map(parseType) };
  return { kind: 'named', name: value };
}

export class TypeRegistry {
  constructor() { this.types = new Map(); }
  defineStruct(name, fields, { generics = [] } = {}) {
    if (this.types.has(name)) throw new Error(`type already defined: ${name}`);
    const normalized = { kind: 'struct', name, generics: [...generics], fields: Object.fromEntries(Object.entries(fields).map(([field, type]) => [field, typeof type === 'string' ? parseType(type) : structuredClone(type)])) };
    this.types.set(name, normalized); return structuredClone(normalized);
  }
  defineAlias(name, target) { if (this.types.has(name)) throw new Error(`type already defined: ${name}`); const value = { kind: 'alias', name, target: typeof target === 'string' ? parseType(target) : target }; this.types.set(name, value); return structuredClone(value); }
  get(name) { return structuredClone(this.types.get(name) ?? null); }
  resolve(type) { if (typeof type === 'string') type = parseType(type); if (type.kind === 'named' && this.types.has(type.name)) return this.resolve(this.types.get(type.name)); if (type.kind === 'alias') return this.resolve(type.target); return structuredClone(type); }
}

export function checkAssignable(from, to, { explicit = false } = {}) {
  if (typeof from === 'string') from = parseType(from); if (typeof to === 'string') to = parseType(to);
  if (sameType(from, to)) return { ok: true, conversion: 'identity' };
  if (to.kind === 'nullable' && sameType(from, to.inner)) return { ok: true, conversion: 'lift-nullable' };
  if (from.kind === 'nullable' && !to.kind?.startsWith?.('nullable')) return { ok: false, reason: 'nullable value requires explicit unwrap or check' };
  if (from.kind === 'int' && to.kind === 'int') {
    const widening = from.signed === to.signed && from.bits <= to.bits;
    if (widening) return { ok: true, conversion: 'integer-widen' };
    return explicit ? { ok: true, conversion: 'checked-integer-cast', checked: true } : { ok: false, reason: 'narrowing or signedness-changing integer conversion requires checked cast' };
  }
  if (from.kind === 'int' && to.kind === 'float') return explicit ? { ok: true, conversion: 'checked-int-float', checked: true } : { ok: false, reason: 'integer-to-float conversion requires explicit checked cast' };
  return { ok: false, reason: `cannot assign ${displayType(from)} to ${displayType(to)}` };
}

export function checkedCast(value, targetType) {
  const target = typeof targetType === 'string' ? parseType(targetType) : targetType;
  if (target.kind === 'int') {
    if (!Number.isInteger(value) && typeof value !== 'bigint') throw new RangeError(`cannot cast non-integer value to ${displayType(target)}`);
    const big = BigInt(value); const min = target.signed ? -(1n << BigInt(target.bits - 1)) : 0n; const max = target.signed ? (1n << BigInt(target.bits - 1)) - 1n : (1n << BigInt(target.bits)) - 1n;
    if (big < min || big > max) throw new RangeError(`value ${value} does not fit ${displayType(target)}`);
    return target.bits <= 53 ? Number(big) : big;
  }
  if (target.kind === 'float') { const n = Number(value); if (!Number.isFinite(n)) throw new RangeError(`value is not finite ${displayType(target)}`); return n; }
  throw new TypeError(`unsupported checked cast target: ${displayType(target)}`);
}

export class OwnershipTracker {
  constructor() { this.values = new Map(); }
  declare(name, { owner = 'current', region = null, movable = true } = {}) { if (this.values.has(name)) throw new Error(`ownership already declared: ${name}`); const state = { name, owner, region, movable, moved: false, borrows: new Map() }; this.values.set(name, state); return structuredClone(state); }
  borrow(name, borrower, { mutable = false } = {}) {
    const state = this.#state(name); this.#assertLive(state);
    if (mutable && state.borrows.size) throw new Error(`cannot mutably borrow '${name}' while borrowed`);
    if (!mutable && [...state.borrows.values()].some((b) => b.mutable)) throw new Error(`cannot borrow '${name}' while mutably borrowed`);
    state.borrows.set(borrower, { mutable, at: Date.now() }); return { name, borrower, mutable };
  }
  releaseBorrow(name, borrower) { return this.#state(name).borrows.delete(borrower); }
  move(name, newOwner) { const state = this.#state(name); this.#assertLive(state); if (!state.movable) throw new Error(`'${name}' is not movable`); if (state.borrows.size) throw new Error(`cannot move '${name}' while borrowed`); state.owner = newOwner; state.moved = true; return structuredClone(state); }
  use(name, owner) { const state = this.#state(name); if (state.moved && state.owner !== owner) throw new Error(`use after move: '${name}' is owned by ${state.owner}`); return true; }
  #state(name) { const state = this.values.get(name); if (!state) throw new Error(`unknown owned value: ${name}`); return state; }
  #assertLive(state) { if (state.moved) throw new Error(`value '${state.name}' was moved`); }
}

export class Region {
  constructor({ name = `region-${crypto.randomUUID()}`, capacity = Infinity } = {}) { this.name = name; this.capacity = capacity; this.allocations = new Map(); this.used = 0; this.closed = false; }
  allocate(size, value = null) { if (this.closed) throw new Error(`region ${this.name} is closed`); if (!Number.isInteger(size) || size < 0) throw new TypeError('allocation size must be a non-negative integer'); if (this.used + size > this.capacity) throw new RangeError(`region ${this.name} capacity exceeded`); const id = crypto.randomUUID(); this.allocations.set(id, { id, size, value, released: false }); this.used += size; return new RegionPointer(this, id); }
  get(id) { const entry = this.allocations.get(id); if (!entry || entry.released || this.closed) throw new Error('invalid or released region allocation'); return entry; }
  release(id) { const entry = this.get(id); entry.released = true; this.used -= entry.size; return true; }
  close() { for (const entry of this.allocations.values()) entry.released = true; this.allocations.clear(); this.used = 0; this.closed = true; }
  snapshot() { return { name: this.name, capacity: this.capacity, used: this.used, closed: this.closed, allocations: [...this.allocations.values()].map(({ id, size, released }) => ({ id, size, released })) }; }
}

export class RegionPointer {
  constructor(region, id) { this.region = region; this.id = id; }
  read() { return this.region.get(this.id).value; }
  write(value) { this.region.get(this.id).value = value; return value; }
  release() { return this.region.release(this.id); }
}

let unsafeDepth = 0;
export function unsafe(work) { if (typeof work !== 'function') throw new TypeError('unsafe() requires a function'); unsafeDepth++; try { return work(); } finally { unsafeDepth--; } }
export function requireUnsafe(operation) { if (unsafeDepth <= 0) throw new Error(`${operation} requires an unsafe boundary`); }

export class RawPointer {
  constructor(buffer, offset = 0, type = 'u8') { requireUnsafe('raw pointer creation'); if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) throw new TypeError('raw pointer requires byte storage'); this.buffer = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength); this.offset = offset; this.type = parseType(type); }
  read() { requireUnsafe('raw pointer read'); return readPrimitive(this.buffer, this.offset, this.type); }
  write(value) { requireUnsafe('raw pointer write'); writePrimitive(this.buffer, this.offset, this.type, value); return value; }
  add(bytes) { requireUnsafe('pointer arithmetic'); return new RawPointer(this.buffer, this.offset + bytes, displayType(this.type)); }
}

export function defineAbiFunction({ name, parameters = [], returns = 'void', callingConvention = 'c', variadic = false }) {
  if (!name) throw new Error('ABI function requires a name');
  return Object.freeze({ name, parameters: parameters.map((p) => ({ name: p.name, type: typeof p.type === 'string' ? parseType(p.type) : p.type })), returns: typeof returns === 'string' ? parseType(returns) : returns, callingConvention, variadic });
}

export function plasmaAbiManifest(moduleName, functions = []) {
  return { protocol: 'plasma-abi/1', module: moduleName, functions: functions.map((fn) => ({ name: fn.name, parameters: fn.parameters.map((p) => ({ name: p.name, type: displayType(p.type) })), returns: displayType(fn.returns), callingConvention: fn.callingConvention, variadic: fn.variadic })) };
}

export const SafetyProfiles = Object.freeze({
  embedded: { forbidDynamicAllocationAfterInit: true, forbidExceptions: true, requireBoundedLoops: false, forbidUnsafe: false, requireExplicitWidths: true },
  realtime: { forbidDynamicAllocationAfterInit: true, forbidBlockingIO: true, requireBoundedLatency: true, forbidUnsafe: false, requireExplicitWidths: true },
  safety: { forbidDynamicAllocationAfterInit: true, forbidBlockingIO: true, requireBoundedLoops: true, forbidUnsafe: true, requireExplicitWidths: true, requireCheckedConversions: true }
});

export function validateSafetyProfile(program, profileName) {
  const profile = SafetyProfiles[profileName]; if (!profile) throw new Error(`unknown safety profile: ${profileName}`);
  const issues = [];
  for (const operation of program.operations ?? []) {
    if (profile.forbidUnsafe && operation.kind === 'unsafe') issues.push({ code: 'CP-SAFE-001', operation, message: 'unsafe operations are forbidden by this profile' });
    if (profile.forbidBlockingIO && operation.kind === 'blocking-io') issues.push({ code: 'CP-SAFE-002', operation, message: 'blocking I/O is forbidden by this profile' });
    if (profile.forbidDynamicAllocationAfterInit && operation.kind === 'allocate' && operation.phase !== 'init') issues.push({ code: 'CP-SAFE-003', operation, message: 'dynamic allocation after initialization is forbidden' });
    if (profile.requireBoundedLoops && operation.kind === 'loop' && operation.bound == null) issues.push({ code: 'CP-SAFE-004', operation, message: 'loop requires a statically known bound' });
  }
  return { ok: issues.length === 0, profile: profileName, issues };
}

function sameType(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function displayType(t){if(!t)return'unknown';if(t.name&&BuiltinType[t.name])return t.name;if(t.kind==='nullable')return `${displayType(t.inner)}?`;if(t.kind==='pointer')return `*${t.mutable?'mut':'const'} ${displayType(t.to)}`;if(t.kind==='generic-instance')return `${t.name}<${t.args.map(displayType).join(', ')}>`;return t.name??t.kind;}
function splitTypeArgs(text){const out=[];let depth=0,start=0;for(let i=0;i<text.length;i++){const c=text[i];if(c==='<')depth++;else if(c==='>')depth--;else if(c===','&&depth===0){out.push(text.slice(start,i).trim());start=i+1;}}out.push(text.slice(start).trim());return out.filter(Boolean);}
function readPrimitive(buffer,offset,type){const name=displayType(type);const map={u8:'readUInt8',i8:'readInt8',u16:'readUInt16LE',i16:'readInt16LE',u32:'readUInt32LE',i32:'readInt32LE',f32:'readFloatLE',f64:'readDoubleLE'};if(name==='u64')return buffer.readBigUInt64LE(offset);if(name==='i64')return buffer.readBigInt64LE(offset);const method=map[name];if(!method)throw new TypeError(`unsupported raw pointer type ${name}`);return buffer[method](offset);}
function writePrimitive(buffer,offset,type,value){const name=displayType(type);const map={u8:'writeUInt8',i8:'writeInt8',u16:'writeUInt16LE',i16:'writeInt16LE',u32:'writeUInt32LE',i32:'writeInt32LE',f32:'writeFloatLE',f64:'writeDoubleLE'};if(name==='u64')return buffer.writeBigUInt64LE(BigInt(value),offset);if(name==='i64')return buffer.writeBigInt64LE(BigInt(value),offset);const method=map[name];if(!method)throw new TypeError(`unsupported raw pointer type ${name}`);return buffer[method](value,offset);}
