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

const { v4: uuidv4 } = require('uuid'); // Add UUID for unique task IDs

class GmailFetchService {
    constructor() {
        this.rateLimitConfig = {
            maxRetries: 5,
            baseDelay: 1000,
            maxDelay: 16000
        };
        this.taskStatus = {}; // Map to track status ('in_progress', 'aborted', 'completed', 'error') of each task
        this.progressStore = {}; // Initialize progress store
        this.abortControllers = {}; // Store AbortControllers for each task
    }

    /**
     * Starts the email fetching process and returns a unique task ID.
     * @param {number|null} amount - Maximum number of emails to fetch. If null, fetches all emails.
     * @returns {string} Unique task ID
     */
    startFetching(amount) {
        const taskId = uuidv4();
        this.taskStatus[taskId] = 'in_progress'; // Initialize status
        this.progressStore[taskId] = {
            processed: 0,
            total: 0,
            emails: [],
            status: 'in_progress',
            error: null
        };

        this.fetchEmails(taskId, amount);
        return taskId;
    }

    /**
     * Fetches emails and updates the progress store.
     * @param {string} taskId - Unique task ID
     * @param {number|null} amount - Maximum number of emails to fetch
     */
    async fetchEmails(taskId, amount) {
        try {
            logger.debug(`[${new Date().toISOString()}] Starting fetchEmails for Task ID: ${taskId}`);
            amount = amount || Number.MAX_SAFE_INTEGER;

            const auth = authService.getOAuth2Client();
            if (!auth) {
                logger.error(`[${new Date().toISOString()}] OAuth2Client is not initialized for Task ID: ${taskId}`);
                this.progressStore[taskId].status = 'error';
                this.progressStore[taskId].error = 'OAuth2Client is not initialized.';
                return;
            }

            const credentials = auth.credentials;
            logger.debug(`[${new Date().toISOString()}] Current OAuth2Client credentials for Task ID ${taskId}: ${JSON.stringify(credentials)}`);

            if (!credentials || !credentials.access_token) {
                logger.error(`[${new Date().toISOString()}] OAuth2Client lacks valid credentials for Task ID: ${taskId}`);
                this.progressStore[taskId].status = 'error';
                this.progressStore[taskId].error = 'OAuth2Client lacks valid credentials.';
                return;
            }

            const gmail = google.gmail({ version: 'v1', auth });
            let processed = 0;
            const startTime = Date.now();
            let nextPageToken = null;
            let totalEmails = amount;

            logger.debug(`[${new Date().toISOString()}] Listing messages from jobs-noreply@linkedin.com for Task ID: ${taskId}`);
            const initialResponse = await gmail.users.messages.list({
                userId: 'me',
                q: 'from:jobs-noreply@linkedin.com',
                maxResults: 1
            });

            if (initialResponse.data.resultSizeEstimate !== undefined) {
                totalEmails = Math.min(amount, initialResponse.data.resultSizeEstimate);
                this.progressStore[taskId].total = totalEmails;
                logger.debug(`[${new Date().toISOString()}] Total emails to fetch for Task ID ${taskId}: ${totalEmails}`);
            } else {
                logger.warn(`[${new Date().toISOString()}] resultSizeEstimate is undefined for Task ID ${taskId}. Proceeding with the requested amount.`);
                this.progressStore[taskId].total = amount;
            }

            const abortController = new AbortController();
            this.abortControllers[taskId] = abortController;

            do {
                // Check if the task has been aborted
                if (this.taskStatus[taskId] === 'aborted') {
                    logger.info(`[${new Date().toISOString()}] Fetch task ${taskId} has been aborted. Stopping fetch.`);
                    break;
                }

                const maxResults = Math.min(500, amount - processed);
                logger.debug(`[${new Date().toISOString()}] Fetching ${maxResults} messages (Processed: ${processed}/${totalEmails}) for Task ID: ${taskId}`);

                const response = await this.fetchWithRetry(() => gmail.users.messages.list({
                    userId: 'me',
                    q: 'from:jobs-noreply@linkedin.com',
                    pageToken: nextPageToken || undefined,
                    maxResults: maxResults
                }), abortController.signal);

                if (abortController.signal.aborted || this.taskStatus[taskId] === 'aborted') {
                    logger.info(`[${new Date().toISOString()}] Fetch task ${taskId} has been aborted during message listing.`);
                    break;
                }

                if (!response || !response.data) {
                    logger.error(`[${new Date().toISOString()}] No data received from messages.list for Task ID: ${taskId}`);
                    this.progressStore[taskId].status = 'error';
                    this.progressStore[taskId].error = 'Failed to retrieve messages.';
                    return;
                }

                const messages = response.data.messages || [];
                nextPageToken = response.data.nextPageToken;

                logger.debug(`[${new Date().toISOString()}] Fetched ${messages.length} messages for Task ID: ${taskId}.`);

                for (const message of messages) {
                    // Each iteration, check if the task has been aborted
                    if (this.taskStatus[taskId] === 'aborted') {
                        logger.info(`[${new Date().toISOString()}] Fetch task ${taskId} has been aborted during message processing.`);
                        break;
                    }

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
                        this.progressStore[taskId].emails.push(relevantData);

                        processed++;
                        this.progressStore[taskId].processed = processed;

                        const elapsedTime = (Date.now() - startTime) / 1000;
                        const currentSpeed = processed / elapsedTime;
                        const remainingEmails = totalEmails - processed;
                        const remainingSeconds = remainingEmails / (currentSpeed || 1);
                        const remainingTime = this.formatTime(remainingSeconds);
                        const eta = this.calculateETA(remainingSeconds);

                        logger.debug(`[${new Date().toISOString()}] Yielding progress: Processed ${processed}/${totalEmails} for Task ID: ${taskId}`);

                        // Update progress
                        this.progressStore[taskId].current_speed = currentSpeed || 0;
                        this.progressStore[taskId].remaining_emails = remainingEmails || 0;
                        this.progressStore[taskId].remaining_time_formatted = remainingTime;
                        this.progressStore[taskId].eta_formatted = eta;

                        if (processed >= amount) {
                            logger.debug(`[${new Date().toISOString()}] Reached the requested amount of emails to fetch for Task ID: ${taskId}.`);
                            break;
                        }
                    } catch (msgError) {
                        logger.error(`[${new Date().toISOString()}] Error fetching message ID ${message.id} for Task ID ${taskId}: ${msgError}`);
                        // Optionally, continue fetching other messages
                    }
                }

                if (processed >= amount) {
                    break;
                }

            } while (nextPageToken && processed < amount);

            const dataToEncrypt = JSON.stringify(this.progressStore[taskId].emails);
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
                logger.debug(`[${new Date().toISOString()}] Successfully saved encrypted email results to ${resultsPath}`);
            } catch (fileError) {
                logger.error(`[${new Date().toISOString()}] Error saving email results file for Task ID ${taskId}:`, fileError);
                this.progressStore[taskId].status = 'error';
                this.progressStore[taskId].error = 'Failed to save email results.';
                throw fileError;
            }

            if (this.taskStatus[taskId] === 'aborted') {
                logger.info(`[${new Date().toISOString()}] Fetch task ${taskId} was aborted.`);
                this.progressStore[taskId].status = 'aborted';
            } else {
                logger.debug(`[${new Date().toISOString()}] Fetching completed for Task ID: ${taskId}.`);
                this.progressStore[taskId].status = 'completed';
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                logger.info(`[${new Date().toISOString()}] Fetch aborted for Task ID: ${taskId}`);
                this.progressStore[taskId].status = 'aborted';
            } else {
                logger.error(`[${new Date().toISOString()}] An error occurred in fetchEmails for Task ID ${taskId}:`, error);
                this.progressStore[taskId].status = 'error';
                this.progressStore[taskId].error = error.message || 'An unknown error occurred.';
            }
        } finally {
            delete this.abortControllers[taskId];
        }
    }

    /**
     * Retrieves the current progress for a given task ID.
     * @param {string} taskId - Unique task ID
     * @returns {object|null} Progress data or null if task ID not found
     */
    getProgress(taskId) {
        return this.progressStore[taskId] || null;
    }

    // ... existing helper methods ...

    /**
     * Example helper method for fetching with retry logic.
     * @param {Function} fn - The function to execute with retry.
     * @returns {Promise<any>}
     */
    async fetchWithRetry(fn) {
        let attempt = 0;
        const { maxRetries, baseDelay, maxDelay } = this.rateLimitConfig;

        while (attempt < maxRetries) {
            try {
                return await fn();
            } catch (error) {
                attempt++;
                if (attempt >= maxRetries) {
                    throw error;
                }
                const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
                logger.warn(`[${new Date().toISOString()}] Retry attempt ${attempt} after error: ${error.message}. Waiting for ${delay}ms.`);
                await new Promise(res => setTimeout(res, delay));
            }
        }
    }

    /**
     * Formats time in seconds to HH:MM:SS format.
     * @param {number} seconds
     * @returns {string}
     */
    formatTime(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hrs}h ${mins}m ${secs}s`;
    }

    /**
     * Calculates ETA based on remaining seconds.
     * @param {number} remainingSeconds
     * @returns {string}
     */
    calculateETA(remainingSeconds) {
        const etaDate = new Date(Date.now() + remainingSeconds * 1000);
        return etaDate.toISOString();
    }

    /**
     * Stops an ongoing fetch task by setting its status to 'aborted'.
     * @param {string} taskId - Unique task ID
     * @returns {boolean} True if successfully aborted, false otherwise
     */
    stopFetching(taskId) {
        if (this.taskStatus[taskId] === 'in_progress') {
            this.taskStatus[taskId] = 'aborted';
            // Also abort via AbortController if implemented
            const abortController = this.abortControllers[taskId];
            if (abortController) {
                abortController.abort();
            }
            logger.debug(`[${new Date().toISOString()}] Fetch task ${taskId} marked as aborted.`);
            return true;
        }
        return false;
    }

    /**
     * Checks if the fetch task should be aborted.
     * @param {string} taskId - Unique task ID
     * @returns {boolean} True if aborted, false otherwise
     */
    isAborted(taskId) {
        return this.taskStatus[taskId] === 'aborted';
    }
}

module.exports = new GmailFetchService();
