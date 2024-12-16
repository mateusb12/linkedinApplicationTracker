const express = require("express");
const { setKey, getKey, deleteKey, clearRedis, getAllKeys } = require("../../external_services/redisService");
const router = express.Router();

/**
 * @route POST /set-redis/set
 * @desc Set a key-value pair in Redis
 * @access Public
 */
router.post('/set', async (req, res) => {
    const { key, value } = req.body;

    if (!key || !value) {
        return res.status(400).send('Key and value are required.');
    }

    try {
        const result = await setKey(key, value);
        res.send(`Key "${key}" set successfully with result: ${result}.`);
    } catch (error) {
        console.error('Error setting key in Redis:', error);
        res.status(500).send('Error setting key in Redis.');
    }
});

/**
 * @route GET /set-redis/get/:key
 * @desc Get the value of a key from Redis
 * @access Public
 */
router.get('/get/:key', async (req, res) => {
    const { key } = req.params;

    if (!key) {
        return res.status(400).send('Key is required.');
    }

    try {
        const value = await getKey(key);
        if (value !== null) {
            res.send(`Value for "${key}": ${value}`);
        } else {
            res.status(404).send(`Key "${key}" not found in Redis.`);
        }
    } catch (error) {
        console.error('Error retrieving key from Redis:', error);
        res.status(500).send('Error retrieving key from Redis.');
    }
});

/**
 * @route DELETE /set-redis/delete/:key
 * @desc Delete a specific key from Redis
 * @access Public
 */
router.delete('/delete/:key', async (req, res) => {
    const { key } = req.params;

    if (!key) {
        return res.status(400).send('Key is required.');
    }

    try {
        const result = await deleteKey(key);
        if (result === 1) {
            res.send(`Key "${key}" deleted successfully.`);
        } else {
            res.status(404).send(`Key "${key}" not found in Redis.`);
        }
    } catch (error) {
        console.error('Error deleting key from Redis:', error);
        res.status(500).send('Error deleting key from Redis.');
    }
});

/**
 * @route POST /set-redis/clear
 * @desc Clear all keys from Redis
 * @access Public
 */
router.post('/clear', async (req, res) => {
    try {
        const result = await clearRedis();
        res.send(`Redis cleared successfully with result: ${result}.`);
    } catch (error) {
        console.error('Error clearing Redis:', error);
        res.status(500).send('Error clearing Redis.');
    }
});

/**
 * @route GET /set-redis/keys
 * @desc Get all keys from Redis
 * @access Public
 */
router.get('/keys', async (req, res) => {
    try {
        const keys = await getAllKeys();
        res.json({ keys });
    } catch (error) {
        console.error('Error fetching keys from Redis:', error);
        res.status(500).send('Error fetching keys from Redis.');
    }
});

module.exports = router;
