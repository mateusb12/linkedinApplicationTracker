const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { google } = require('googleapis');
const authService = require('./gmailAuthService');
const fs = require('fs').promises;
const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
const key = process.env.ENCRYPTION_KEY;

if (!key) {
    throw new Error('Encryption key is not set. Please set the ENCRYPTION_KEY environment variable.');
}

if (Buffer.from(key).length !== 32) {
    throw new Error('Encryption key must be 32 bytes (256 bits) long for aes-256-cbc.');
}

const winston = require('winston');

const logger = winston.createLogger({
    level: 'error',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log' }),
        new winston.transports.Console()
    ],
});

class GmailFetchService {
    async* fetchEmailsGenerator(amount) {
        try {
            amount = amount || Number.MAX_SAFE_INTEGER;

            const auth = authService.getOAuth2Client();
            const gmail = google.gmail({ version: 'v1', auth });
            const emailResults = [];
            let processed = 0;
            const startTime = Date.now();
            let nextPageToken = null;
            let totalEmails = amount;

            const initialResponse = await gmail.users.messages.list({
                userId: 'me',
                q: 'from:jobs-noreply@linkedin.com',
                maxResults: 1
            });

            if (initialResponse.data.resultSizeEstimate !== undefined) {
                totalEmails = Math.min(amount, initialResponse.data.resultSizeEstimate);
            }

            do {
                const maxResults = Math.min(500, amount - processed);

                const response = await this.fetchWithRetry(() => gmail.users.messages.list({
                    userId: 'me',
                    q: 'from:jobs-noreply@linkedin.com',
                    pageToken: nextPageToken || undefined,
                    maxResults: maxResults
                }));

                const messages = response.data.messages || [];
                nextPageToken = response.data.nextPageToken;

                for (const message of messages) {
                    const emailData = await gmail.users.messages.get({
                        userId: 'me',
                        id: message.id
                    });

                    const relevantData = {
                        id: emailData.data.id,
                        snippet: emailData.data.snippet,
                        internalDate: emailData.data.internalDate
                    };
                    emailResults.push(relevantData);

                    processed++;

                    const elapsedTime = (Date.now() - startTime) / 1000;
                    const currentSpeed = processed / elapsedTime;
                    const remainingEmails = totalEmails - processed;
                    const remainingSeconds = remainingEmails / (currentSpeed || 1);
                    const remainingTime = this.formatTime(remainingSeconds);
                    const eta = this.calculateETA(remainingSeconds);

                    yield JSON.stringify({
                        emails_processed: processed,
                        total_emails: totalEmails,
                        current_speed: currentSpeed || 0,
                        remaining_emails: remainingEmails || 0,
                        remaining_time_formatted: remainingTime,
                        eta_formatted: eta,
                        message: 'Processing emails...'
                    });

                    if (processed >= amount) {
                        break;
                    }
                }

                if (processed >= amount) {
                    break;
                }

            } while (nextPageToken && processed < amount);

            const dataToEncrypt = JSON.stringify(emailResults);
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv);
            let encrypted = cipher.update(dataToEncrypt);
            encrypted = Buffer.concat([encrypted, cipher.final()]);

            const encryptedData = {
                iv: iv.toString('base64'),
                data: encrypted.toString('base64')
            };

            const resultsPath = path.join(__dirname, '../data/email_results.json');

            try {
                await fs.mkdir(path.dirname(resultsPath), { recursive: true });
                await fs.writeFile(resultsPath, JSON.stringify(encryptedData, null, 2));
            } catch (fileError) {
                logger.error('Error saving file:', fileError);
                throw fileError;
            }

            yield JSON.stringify({
                message: 'Email fetching completed.',
                emails_processed: processed,
                total_emails: totalEmails
            });

        } catch (error) {
            logger.error('Error in fetchEmailsGenerator:', error);
            yield JSON.stringify({
                error: 'An unexpected error occurred while fetching emails. Please try again later.'
            });
        }
    }

    async fetchWithRetry(fetchFunction, retries = 3, delay = 1000) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await fetchFunction();
            } catch (error) {
                if (attempt === retries) {
                    throw error;
                }
                logger.warn(`Attempt ${attempt} failed. Retrying in ${delay}ms...`);
                await new Promise(res => setTimeout(res, delay));
            }
        }
    }

    formatTime(seconds) {
        if (!isFinite(seconds)) return 'Calculating...';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        return `${hours}h ${minutes}m ${secs}s`;
    }

    calculateETA(remainingSeconds) {
        if (!isFinite(remainingSeconds)) return 'Calculating...';

        const eta = new Date(Date.now() + (remainingSeconds * 1000));
        return eta.toLocaleTimeString('en-GB', { hour12: false });
    }

    async decryptEmailResults(encryptedFile) {
        try {
            const fileContent = await fs.readFile(encryptedFile, 'utf8');
            const encryptedData = JSON.parse(fileContent);
            
            const iv = Buffer.from(encryptedData.iv, 'base64');
            const encrypted = Buffer.from(encryptedData.data, 'base64');
            
            const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), iv);
            let decrypted = decipher.update(encrypted);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            
            const decryptedString = decrypted.toString('utf8');
            const decryptedData = JSON.parse(decryptedString);
            
            if (!Array.isArray(decryptedData)) {
                throw new Error('Decrypted data is not an array');
            }
            
            return decryptedData;
            
        } catch (error) {
            logger.error('Error in decryptEmailResults:', error);
            throw error;
        }
    }

    async displayEmailResults() {
        try {
            const resultsPath = path.join(__dirname, '../data/email_results.json');
            const decryptedData = await this.decryptEmailResults(resultsPath);
            
            const formattedData = decryptedData.map(email => ({
                id: email.id,
                date: new Date(parseInt(email.internalDate)).toLocaleString(),
                snippet: email.snippet
            }));

            const readablePath = path.join(__dirname, '../data/email_results_readable.json');
            await fs.writeFile(
                readablePath, 
                JSON.stringify(formattedData, null, 2)
            );
            
            return formattedData;
        } catch (error) {
            logger.error('Error displaying email results:', error);
            throw error;
        }
    }
}

module.exports = new GmailFetchService();
