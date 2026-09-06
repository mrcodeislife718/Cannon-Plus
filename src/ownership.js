export class OwnershipTracker {
  constructor() {
    this.values = new Map();
  }

  declare(name, { owner = 'current', region = null, movable = true } = {}) {
    if (this.values.has(name)) throw new Error(`ownership already declared: ${name}`);
    const state = { name, owner, region, movable, borrows: new Map(), generation: 0, previousOwners: [] };
    this.values.set(name, state);
    return snapshot(state);
  }

  borrow(name, borrower, { mutable = false } = {}) {
    const state = this.#state(name);
    if (!borrower) throw new TypeError('borrower is required');
    if (state.borrows.has(borrower)) throw new Error(`borrow already exists for '${name}' by ${borrower}`);
    if (mutable && state.borrows.size) throw new Error(`cannot mutably borrow '${name}' while borrowed`);
    if (!mutable && [...state.borrows.values()].some((borrow) => borrow.mutable)) throw new Error(`cannot borrow '${name}' while mutably borrowed`);
    state.borrows.set(borrower, { mutable, generation: state.generation, at: Date.now() });
    return { name, owner: state.owner, borrower, mutable, generation: state.generation };
  }

  releaseBorrow(name, borrower) {
    return this.#state(name).borrows.delete(borrower);
  }

  move(name, newOwner) {
    const state = this.#state(name);
    if (!newOwner) throw new TypeError('new owner is required');
    if (!state.movable) throw new Error(`'${name}' is not movable`);
    if (state.borrows.size) throw new Error(`cannot move '${name}' while borrowed`);
    if (state.owner === newOwner) return snapshot(state);
    state.previousOwners.push(state.owner);
    state.owner = newOwner;
    state.generation += 1;
    return snapshot(state);
  }

  use(name, owner) {
    const state = this.#state(name);
    if (owner !== state.owner) {
      const transferred = state.previousOwners.includes(owner);
      throw new Error(transferred
        ? `use after move: '${name}' is owned by ${state.owner}`
        : `ownership violation: '${name}' is owned by ${state.owner}`);
    }
    return true;
  }

  snapshot(name) {
    return snapshot(this.#state(name));
  }

  #state(name) {
    const state = this.values.get(name);
    if (!state) throw new Error(`unknown owned value: ${name}`);
    return state;
  }
}

function snapshot(state) {
  return {
    name: state.name,
    owner: state.owner,
    region: state.region,
    movable: state.movable,
    generation: state.generation,
    previousOwners: [...state.previousOwners],
    borrows: [...state.borrows.entries()].map(([borrower, borrow]) => ({ borrower, ...borrow }))
  };
}
