const express = require("express");
const {setKey, getKey} = require("../../external_services/redisService");
const router = express.Router();


/**
 * @route POST /set-redis
 * @desc Set a key-value pair in Redis
 * @access Public
 */
router.post('/set-redis', async (req, res) => {
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
 * @route GET /get-redis/:key
 * @desc Get the value of a key from Redis
 * @access Public
 */
router.get('/get-redis/:key', async (req, res) => {
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

module.exports = router;