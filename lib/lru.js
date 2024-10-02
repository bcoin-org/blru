/*!
 * lru.js - LRU cache for bcoin
 * Copyright (c) 2014-2018, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('bsert');

/**
 * LRU Cache
 * @template K - Key type
 * @template V - Value type
 */

class LRU {
  /** @type {Map<K, LRUItem<K, V>>} */
  map;

  /**
   * Create an LRU cache.
   * @constructor
   * @param {Number} capacity
   * @param {Function} [getSize]
   * @param {Function} [CustomMap]
   */

  constructor(capacity, getSize, CustomMap) {
    assert(typeof capacity === 'number', 'Capacity must be a number.');
    assert(capacity >= 0, 'Capacity cannot be negative.');
    assert(!getSize || typeof getSize === 'function', 'Bad size callback.');
    assert(!CustomMap || typeof CustomMap === 'function');

    // @ts-ignore
    this.map = CustomMap ? new CustomMap() : new Map();
    this.size = 0;
    this.items = 0;
    /** @type {LRUItem<K, V>?} */
    this.head = null;
    /** @type {LRUItem<K, V>?} */
    this.tail = null;
    /** @type {LRUBatch<K, V>?} */
    this.pending = null;

    this.capacity = capacity;
    this.getSize = getSize;
  }

  /**
   * Calculate size of an item.
   * @private
   * @param {LRUItem<K, V>} item
   * @returns {Number} Size.
   */

  _getSize(item) {
    if (this.getSize)
      return 120 + this.getSize(item.value, item.key);

    return 1;
  }

  /**
   * Compact the LRU linked list.
   * @private
   */

  _compact() {
    if (this.size <= this.capacity)
      return;

    /** @type {LRUItem<K, V>?} */
    let item = null;
    /** @type {LRUItem<K, V>?} */
    let next = null;

    for (item = this.head; item; item = next) {
      if (this.size <= this.capacity)
        break;

      this.size -= this._getSize(item);
      this.items -= 1;
      this.map.delete(item.key);

      next = item.next;

      item.prev = null;
      item.next = null;
    }

    if (!item) {
      this.head = null;
      this.tail = null;
      return;
    }

    this.head = item;
    item.prev = null;
  }

  /**
   * Reset the cache. Clear all items.
   */

  reset() {
    let item, next;

    for (item = this.head; item; item = next) {
      this.map.delete(item.key);
      this.items -= 1;
      next = item.next;
      item.prev = null;
      item.next = null;
    }

    assert(!item);

    this.size = 0;
    this.head = null;
    this.tail = null;
  }

  /**
   * Add an item to the cache.
   * @param {K} key
   * @param {V} value
   */

  set(key, value) {
    if (this.capacity === 0)
      return;

    let item = this.map.get(key);

    if (item) {
      this.size -= this._getSize(item);
      item.value = value;
      this.size += this._getSize(item);
      this._removeList(item);
      this._appendList(item);
      this._compact();
      return;
    }

    item = new LRUItem(key, value);

    this.map.set(key, item);

    this._appendList(item);

    this.size += this._getSize(item);
    this.items += 1;

    this._compact();
  }

  /**
   * Retrieve an item from the cache.
   * @param {K} key
   * @returns {V} Item.
   */

  get(key) {
    if (this.capacity === 0)
      return null;

    const item = this.map.get(key);

    if (!item)
      return null;

    this._removeList(item);
    this._appendList(item);

    return item.value;
  }

  /**
   * Test whether the cache contains a key.
   * @param {K} key
   * @returns {Boolean}
   */

  has(key) {
    if (this.capacity === 0)
      return false;
    return this.map.has(key);
  }

  /**
   * Remove an item from the cache.
   * @param {K} key
   * @returns {Boolean} Whether an item was removed.
   */

  remove(key) {
    if (this.capacity === 0)
      return false;

    const item = this.map.get(key);

    if (!item)
      return false;

    this.size -= this._getSize(item);
    this.items -= 1;

    this.map.delete(key);

    this._removeList(item);

    return true;
  }

  /**
   * Append an item to the linked list (sets new tail).
   * @private
   * @param {LRUItem<K, V>} item
   */

  _appendList(item) {
    this._insertList(this.tail, item);
  }

  /**
   * Insert item into the linked list.
   * @private
   * @param {LRUItem<K, V>?} ref
   * @param {LRUItem<K, V>} item
   */

  _insertList(ref, item) {
    assert(!item.next);
    assert(!item.prev);

    if (ref == null) {
      if (!this.head) {
        this.head = item;
        this.tail = item;
      } else {
        this.head.prev = item;
        item.next = this.head;
        this.head = item;
      }
      return;
    }

    item.next = ref.next;
    item.prev = ref;
    ref.next = item;

    if (item.next)
      item.next.prev = item;

    if (ref === this.tail)
      this.tail = item;
  }

  /**
   * Remove item from the linked list.
   * @private
   * @param {LRUItem<K, V>} item
   */

  _removeList(item) {
    if (item.prev)
      item.prev.next = item.next;

    if (item.next)
      item.next.prev = item.prev;

    if (item === this.head)
      this.head = item.next;

    if (item === this.tail)
      this.tail = item.prev || this.head;

    if (!this.head)
      assert(!this.tail);

    if (!this.tail)
      assert(!this.head);

    item.prev = null;
    item.next = null;
  }

  /**
   * Collect all keys in the cache, sorted by LRU.
   * @returns {K[]}
   */

  keys() {
    const items = [];

    for (let item = this.head; item; item = item.next) {
      if (item === this.head)
        assert(!item.prev);
      if (!item.prev)
        assert(item === this.head);
      if (!item.next)
        assert(item === this.tail);
      items.push(item.key);
    }

    return items;
  }

  /**
   * Collect all values in the cache, sorted by LRU.
   * @returns {V[]}
   */

  values() {
    const items = [];

    for (let item = this.head; item; item = item.next)
      items.push(item.value);

    return items;
  }

  /**
   * Convert the LRU cache to an array of items.
   * @returns {LRUItem<K, V>[]}
   */

  toArray() {
    const items = [];

    for (let item = this.head; item; item = item.next)
      items.push(item);

    return items;
  }

  /**
   * Create an atomic batch for the lru
   * (used for caching database writes).
   * @returns {LRUBatch<K, V>}
   */

  batch() {
    return new LRUBatch(this);
  }

  /**
   * Start the pending batch.
   */

  start() {
    assert(!this.pending);
    this.pending = this.batch();
  }

  /**
   * Clear the pending batch.
   */

  clear() {
    assert(this.pending);
    this.pending.clear();
  }

  /**
   * Drop the pending batch.
   */

  drop() {
    assert(this.pending);
    this.pending = null;
  }

  /**
   * Commit the pending batch.
   */

  commit() {
    assert(this.pending);
    this.pending.commit();
    this.pending = null;
  }

  /**
   * Push an item onto the pending batch.
   * @param {K} key
   * @param {V} value
   */

  push(key, value) {
    assert(this.pending);

    if (this.capacity === 0)
      return;

    this.pending.set(key, value);
  }

  /**
   * Push a removal onto the pending batch.
   * @param {K} key
   */

  unpush(key) {
    assert(this.pending);

    if (this.capacity === 0)
      return;

    this.pending.remove(key);
  }
}

/**
 * LRU Item
 * @alias module:utils.LRUItem
 * @template K - Key type
 * @template V - Value type
 */

class LRUItem {
  /**
   * Create an LRU item.
   * @constructor
   * @param {K} key
   * @param {V} value
   */

  constructor(key, value) {
    this.key = key;
    this.value = value;
    /** @type {LRUItem<K, V>?} */
    this.next = null;
    /** @type {LRUItem<K, V>?} */
    this.prev = null;
  }
}

/**
 * LRU Batch
 * @alias module:utils.LRUBatch
 * @template K - Key type
 * @template V - Value type
 */

class LRUBatch {
  /**
   * Create an LRU batch.
   * @constructor
   * @param {LRU<K, V>} lru
   */

  constructor(lru) {
    this.lru = lru;
    /** @type {LRUOp<K, V>[]} */
    this.ops = [];
  }

  /**
   * Push an item onto the batch.
   * @param {K} key
   * @param {V} value
   */

  set(key, value) {
    this.ops.push(new LRUOp(false, key, value));
  }

  /**
   * Push a removal onto the batch.
   * @param {K} key
   */

  remove(key) {
    this.ops.push(new LRUOp(true, key, null));
  }

  /**
   * Clear the batch.
   */

  clear() {
    this.ops.length = 0;
  }

  /**
   * Commit the batch.
   */

  commit() {
    for (const op of this.ops) {
      if (op.remove) {
        this.lru.remove(op.key);
        continue;
      }
      this.lru.set(op.key, op.value);
    }

    this.ops.length = 0;
  }
}

/**
 * LRU Op
 * @alias module:utils.LRUOp
 * @template K
 * @template V
 * @private
 */

class LRUOp {
  /**
   * Create an LRU op.
   * @constructor
   * @param {Boolean} remove
   * @param {K} key
   * @param {V} value
   */

  constructor(remove, key, value) {
    this.remove = remove;
    this.key = key;
    this.value = value;
  }
}

/*
 * Expose
 */

module.exports = LRU;
