const Redis = require('ioredis');

const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    retryStrategy: times => Math.min(times * 50, 2000)
});

redis.on('connect', () => console.log('Connected to Redis'));
redis.on('error', (err) => console.log('Redis error:', err));

/**
 * Sets a key-value pair in Redis.
 * @param {string} key - The key to set.
 * @param {string} value - The value to associate with the key.
 * @returns {Promise<string>} - The result of the set operation.
 */
const setKey = async (key, value) => {
    return redis.set(key, value);
};

/**
 * Retrieves the value for a given key from Redis.
 * @param {string} key - The key to retrieve.
 * @returns {Promise<string|null>} - The value associated with the key, or null if not found.
 */
const getKey = async (key) => {
    return redis.get(key);
};

/**
 * Deletes a specific key from Redis.
 * @param {string} key - The key to delete.
 * @returns {Promise<number>} - The number of keys that were removed.
 */
const deleteKey = async (key) => {
    return redis.del(key);
};

/**
 * Clears all keys from the current Redis database.
 * @returns {Promise<string>} - The result of the flush operation.
 */
const clearRedis = async () => {
    return redis.flushdb();
};

/**
 * Retrieves all keys from Redis using SCAN to avoid blocking.
 * @param {number} [count=100] - The number of keys to retrieve per SCAN iteration.
 * @returns {Promise<string[]>} - An array of all keys in Redis.
 */
const getAllKeys = async (count = 100) => {
    let keys = [];
    let cursor = '0';
    do {
        const reply = await redis.scan(cursor, 'COUNT', count);
        cursor = reply[0];
        keys = keys.concat(reply[1]);
    } while (cursor !== '0');
    return keys;
};

module.exports = {
    redis,
    setKey,
    getKey,
    deleteKey,
    clearRedis,
    getAllKeys
};
