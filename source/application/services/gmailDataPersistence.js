// services/gmailDataPersistence.js

const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger'); // Adjust the path if necessary

class MailDataPersistence {
    static async saveData(data, filePath) {
        try {
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            logger.info(`Successfully saved data to ${filePath}`);
        } catch (error) {
            logger.error(`Error saving data to file ${filePath}:`, error);
            throw error;
        }
    }

    // Optionally, provide a loadData method if needed
    static async loadData(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            logger.error(`Error loading data from file ${filePath}:`, error);
            throw error;
        }
    }
}

module.exports = MailDataPersistence;
