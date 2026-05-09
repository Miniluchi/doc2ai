/**
 * Minimal chainable Drizzle stand-in for service-level unit tests.
 *
 * Drizzle queries are fluent (`db.update(t).set(...).where(...).returning()`)
 * and any link in the chain must be awaitable. This builds a Proxy that
 * returns itself for unknown methods and resolves to the configured value
 * via `.then()`.
 */

type AsyncSource<T> = () => T | Promise<T>;

export function makeChain<T = unknown>(getResolved: AsyncSource<T>) {
  const handler: ProxyHandler<() => unknown> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: T) => unknown, reject?: (reason: unknown) => unknown): unknown => {
          try {
            return Promise.resolve(getResolved()).then(resolve, reject);
          } catch (err) {
            if (reject) reject(err);
            return undefined;
          }
        };
      }
      if (prop === 'catch') {
        return (reject: (reason: unknown) => unknown) =>
          Promise.resolve(getResolved()).catch(reject);
      }
      // Anything else returns the same chain (so .from, .where, .set, .values, etc. all chain)
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  };
  const proxy = new Proxy(() => proxy, handler) as unknown as Record<string, unknown> &
    PromiseLike<T>;
  return proxy;
}

export interface FakeDbState {
  selectRows: unknown[];
  insertRows: unknown[];
  updateRows: unknown[];
  deleteRows: unknown[];
  queryFindFirst: unknown;
  queryFindMany: unknown[];
}

export function createFakeDb(state: FakeDbState) {
  const queryProxy = new Proxy(
    {},
    {
      get() {
        return {
          findFirst: () => Promise.resolve(state.queryFindFirst),
          findMany: () => Promise.resolve(state.queryFindMany),
        };
      },
    },
  );

  return {
    query: queryProxy,
    select: () => makeChain(() => state.selectRows),
    insert: () => makeChain(() => state.insertRows),
    update: () => makeChain(() => state.updateRows),
    delete: () => makeChain(() => state.deleteRows),
  };
}

export function makeFakeDbState(overrides: Partial<FakeDbState> = {}): FakeDbState {
  return {
    selectRows: [],
    insertRows: [],
    updateRows: [],
    deleteRows: [],
    queryFindFirst: null,
    queryFindMany: [],
    ...overrides,
  };
}
