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
    level: 'debug',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log' }),
        new winston.transports.Console()
    ],
});

class GmailFetchService {
    constructor() {
        this.rateLimitConfig = {
            maxRetries: 5,
            baseDelay: 1000,
            maxDelay: 16000
        };
    }

    /**
     * Fetches emails from Gmail using the jobs-noreply@linkedin.com filter
     * @generator
     * @param {number|null} amount - Maximum number of emails to fetch. If null, fetches all emails.
     * @yields {string} JSON string containing progress information
     * @throws {Error} If authentication or API calls fail
     */
    async* fetchEmailsGenerator(amount) {
        try {
            logger.debug('[' + new Date().toISOString() + '] Starting fetchEmailsGenerator.');
            amount = amount || Number.MAX_SAFE_INTEGER;

            const auth = authService.getOAuth2Client();
            if (!auth) {
                logger.error('[' + new Date().toISOString() + '] OAuth2Client is not initialized.');
                yield JSON.stringify({
                    error: 'OAuth2Client is not initialized.'
                });
                return;
            }

            const credentials = auth.credentials;
            logger.debug(`['${new Date().toISOString()}'] Current OAuth2Client credentials: ${JSON.stringify(credentials)}`);

            if (!credentials || !credentials.access_token) {
                logger.error('[' + new Date().toISOString() + '] OAuth2Client lacks valid credentials.');
                yield JSON.stringify({
                    error: 'OAuth2Client lacks valid credentials.'
                });
                return;
            }

            const gmail = google.gmail({ version: 'v1', auth });
            const emailResults = [];
            let processed = 0;
            const startTime = Date.now();
            let nextPageToken = null;
            let totalEmails = amount;

            logger.debug('[' + new Date().toISOString() + '] Listing messages from jobs-noreply@linkedin.com');
            const initialResponse = await gmail.users.messages.list({
                userId: 'me',
                q: 'from:jobs-noreply@linkedin.com',
                maxResults: 1
            });

            if (initialResponse.data.resultSizeEstimate !== undefined) {
                totalEmails = Math.min(amount, initialResponse.data.resultSizeEstimate);
                logger.debug(`['${new Date().toISOString()}'] Total emails to fetch: ${totalEmails}`);
            }

            do {
                const maxResults = Math.min(500, amount - processed);
                logger.debug(`['${new Date().toISOString()}'] Fetching ${maxResults} messages (Processed: ${processed}/${totalEmails})`);

                const response = await this.fetchWithRetry(() => gmail.users.messages.list({
                    userId: 'me',
                    q: 'from:jobs-noreply@linkedin.com',
                    pageToken: nextPageToken || undefined,
                    maxResults: maxResults
                }));

                if (!response || !response.data) {
                    logger.error('[' + new Date().toISOString() + '] No data received from messages.list');
                    yield JSON.stringify({
                        error: 'Failed to retrieve messages.'
                    });
                    return;
                }

                const messages = response.data.messages || [];
                nextPageToken = response.data.nextPageToken;

                logger.debug(`['${new Date().toISOString()}'] Fetched ${messages.length} messages.`);

                for (const message of messages) {
                    try {
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

                        logger.debug(`['${new Date().toISOString()}'] Yielding progress: Processed ${processed}/${totalEmails}`);

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
                            logger.debug('[' + new Date().toISOString() + '] Reached the requested amount of emails to fetch.');
                            break;
                        }
                    } catch (msgError) {
                        logger.error(`['${new Date().toISOString()}'] Error fetching message ID ${message.id}: ${msgError}`);
                        // Optionally, continue fetching other messages
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
                logger.debug(`['${new Date().toISOString()}'] Successfully saved encrypted email results to ${resultsPath}`);
            } catch (fileError) {
                logger.error('[' + new Date().toISOString() + '] Error saving email results file:', fileError);
                throw fileError;
            }

            logger.debug('[' + new Date().toISOString() + '] Yielding completion message.');
            yield JSON.stringify({
                message: 'Email fetching completed.',
                emails_processed: processed,
                total_emails: totalEmails
            });

        } catch (error) {
            logger.error('[' + new Date().toISOString() + '] Error in fetchEmailsGenerator:', error);
            yield JSON.stringify({
                error: 'An unexpected error occurred while fetching emails. Please check server logs for more details.'
            });
        }
    }

    /**
     * Decrypts stored email results using AES-256-CBC encryption
     * @param {string} encryptedFile - Path to the encrypted file
     * @returns {Promise<Array>} Decrypted email data
     * @throws {Error} If decryption fails or data is invalid
     */
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

    /**
     * Formats time duration into human-readable string
     * @param {number} seconds - Number of seconds to format
     * @returns {string} Formatted time string (e.g., "2h 30m 45s")
     */
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

    async fetchWithRetry(fetchFunction, retries = this.rateLimitConfig.maxRetries) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await fetchFunction();
            } catch (error) {
                if (error.code === 429) {
                    const delay = Math.min(
                        this.rateLimitConfig.baseDelay * Math.pow(2, attempt - 1),
                        this.rateLimitConfig.maxDelay
                    );
                    logger.warn(`Rate limit hit. Retrying in ${delay}ms... (Attempt ${attempt}/${retries})`);
                    await new Promise(res => setTimeout(res, delay));
                } else if (error.code === 401) {
                    logger.error('Authentication token expired');
                    throw new Error('Authentication expired. Please re-authenticate.');
                } else if (attempt === retries) {
                    logger.error('Max retries reached:', error);
                    throw error;
                } else {
                    logger.warn(`Attempt ${attempt} failed. Retrying...`, error);
                    await new Promise(res => setTimeout(res, 1000 * attempt));
                }
            }
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
