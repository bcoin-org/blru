'use strict';

const assert = require('bsert');
const LRU = require('../lib/lru');

describe('LRU', function() {
  it('should test lru', () => {
    const cap = 10;
    const all = 100;
    const lru = new LRU(cap);

    for (let i = 0; i < all; i++)
      lru.set(i, i);

    for (let i = 0; i < all - cap; i++)
      assert(!lru.has(i));

    for (let i = all - cap; i < all; i++) {
      assert(lru.has(i));
      assert.strictEqual(lru.get(i), i);
    }
  });
});
