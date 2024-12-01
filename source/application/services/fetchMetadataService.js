// fetchMetadataService.js
const fs = require('fs').promises;
const path = require('path');

class FetchMetadataService {
    constructor() {
        this.metadataPath = path.join(__dirname, '../../data/fetch_metadata.json');
    }

    async getMetadata() {
        try {
            const data = await fs.readFile(this.metadataPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return {
                lastFetchTime: null,
                emailsFetched: 0
            };
        }
    }
}

module.exports = new FetchMetadataService(); 