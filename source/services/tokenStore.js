const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const tokenPath = path.join(__dirname, '../tokens/token.json');

const getTokens = () => {
    try {
        if (!fs.existsSync(tokenPath)) {
            logger.warn('Token file does not exist.');
            return null;
        }
        const data = fs.readFileSync(tokenPath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        logger.error('Error reading tokens:', error);
        return null;
    }
};

const setTokens = (tokens) => {
    try {
        fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
        logger.info('Tokens saved successfully.');
    } catch (error) {
        logger.error('Error saving tokens:', error);
        throw error;
    }
};

const clearTokens = () => {
    try {
        if (fs.existsSync(tokenPath)) {
            fs.unlinkSync(tokenPath);
            logger.info('Tokens cleared successfully.');
        }
    } catch (error) {
        logger.error('Error clearing tokens:', error);
        throw error;
    }
};

module.exports = {
    getTokens,
    setTokens,
    clearTokens
}; 