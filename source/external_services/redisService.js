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
    return await redis.set(key, value);
};

/**
 * Retrieves the value for a given key from Redis.
 * @param {string} key - The key to retrieve.
 * @returns {Promise<string|null>} - The value associated with the key, or null if not found.
 */
const getKey = async (key) => {
    return await redis.get(key);
};

module.exports = {
    redis,
    setKey,
    getKey
};