// tokenStore.js
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../../application/services/logger'); // Assuming you have a logger module

const TOKEN_PATH = path.join(__dirname, '../../../application/data/token.json');

async function saveTokens(tokens) {
    try {
        await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
        logger.debug('Tokens saved to file:', TOKEN_PATH);
    } catch (err) {
        logger.error('Error saving tokens to file:', err);
        throw err;
    }
}

async function loadTokens() {
    try {
        const data = await fs.readFile(TOKEN_PATH, 'utf8');
        const tokens = JSON.parse(data);
        logger.debug('Tokens loaded from file:', TOKEN_PATH);
        return tokens;
    } catch (err) {
        logger.warn('No tokens found, user needs to authenticate.');
        throw err;
    }
}

async function clearTokens() {
    try {
        await fs.unlink(TOKEN_PATH);
        logger.debug('Tokens cleared successfully.');
    } catch (err) {
        logger.error('Error clearing tokens:', err);
        throw err;
    }
}

module.exports = {
    saveTokens,
    loadTokens,
    clearTokens,
};
