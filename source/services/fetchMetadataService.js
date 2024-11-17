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

    async updateMetadata(emailCount) {
        const metadata = {
            lastFetchTime: new Date().toISOString(),
            emailsFetched: emailCount
        };
        
        try {
            await fs.mkdir(path.dirname(this.metadataPath), { recursive: true });
            await fs.writeFile(this.metadataPath, JSON.stringify(metadata, null, 2));
        } catch (error) {
            console.error('Error saving metadata:', error);
        }
    }
}

module.exports = new FetchMetadataService(); 