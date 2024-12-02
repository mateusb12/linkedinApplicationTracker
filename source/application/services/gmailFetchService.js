// services/gmailFetchService.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { google } = require('googleapis');
const authService = require('./gmailAuthService');
const logger = require('./logger'); // Adjust the path if necessary
const fs = require('fs');

class GmailFetchService {
    constructor(encryptionService, dataPersistenceService) {
        this.rateLimitConfig = {
            maxRetries: 5,
            baseDelay: 1000,
            maxDelay: 16000
        };
        this.encryptionService = encryptionService;
        this.dataPersistenceService = dataPersistenceService;
    }

    /**
     * Fetches emails.
     * @param {string} taskId - Unique task ID
     * @param {number|null} amount - Maximum number of emails to fetch
     * @param {AbortSignal} abortSignal - Abort signal to cancel the operation
     * @param {Function} progressCallback - Callback function to report progress
     * @returns {Promise<Array>} - Resolves to array of email data
     */
    async fetchEmails(taskId, amount, abortSignal, progressCallback) {
        try {
            logger.info(`Starting fetchEmails for Task ID: ${taskId}`);
            amount = amount || Number.MAX_SAFE_INTEGER;

            const auth = authService.getOAuth2Client();
            if (!auth) {
                logger.error(`OAuth2Client is not initialized for Task ID: ${taskId}`);
                throw new Error('OAuth2Client is not initialized.');
            }

            const credentials = auth.credentials;
            logger.info(`Current OAuth2Client credentials for Task ID ${taskId}: ${JSON.stringify(credentials)}`);

            if (!credentials || !credentials.access_token) {
                logger.error(`OAuth2Client lacks valid credentials for Task ID: ${taskId}`);
                throw new Error('OAuth2Client lacks valid credentials.');
            }

            const gmail = google.gmail({ version: 'v1', auth });
            let processed = 0;
            const startTime = Date.now();
            let nextPageToken = null;
            let totalEmails = amount;

            logger.info(`Listing messages from jobs-noreply@linkedin.com for Task ID: ${taskId}`);
            const initialResponse = await gmail.users.messages.list({
                userId: 'me',
                q: 'from:jobs-noreply@linkedin.com',
                maxResults: 1
            });

            if (initialResponse.data.resultSizeEstimate !== undefined) {
                totalEmails = Math.min(amount, initialResponse.data.resultSizeEstimate);
                logger.info(`Total emails to fetch for Task ID ${taskId}: ${totalEmails}`);
            } else {
                logger.warn(`resultSizeEstimate is undefined for Task ID ${taskId}. Proceeding with the requested amount.`);
            }

            const emails = [];

            do {
                if (abortSignal.aborted) {
                    logger.info(`Fetch task ${taskId} has been aborted. Stopping fetch.`);
                    break;
                }

                const maxResults = Math.min(500, amount - processed);
                logger.info(`Fetching ${maxResults} messages (Processed: ${processed}/${totalEmails}) for Task ID: ${taskId}`);

                const response = await this.fetchWithRetry(() => gmail.users.messages.list({
                    userId: 'me',
                    q: 'from:jobs-noreply@linkedin.com',
                    pageToken: nextPageToken || undefined,
                    maxResults: maxResults
                }), abortSignal);

                if (abortSignal.aborted) {
                    logger.info(`Fetch task ${taskId} has been aborted during message listing.`);
                    break;
                }

                if (!response || !response.data) {
                    logger.error(`No data received from messages.list for Task ID: ${taskId}`);
                    throw new Error('Failed to retrieve messages.');
                }

                const messages = response.data.messages || [];
                nextPageToken = response.data.nextPageToken;

                logger.info(`Fetched ${messages.length} messages for Task ID: ${taskId}.`);

                for (const message of messages) {
                    if (abortSignal.aborted) {
                        logger.info(`Fetch task ${taskId} has been aborted during message processing.`);
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
                        emails.push(relevantData);

                        processed++;

                        if (progressCallback) {
                            const elapsedTime = (Date.now() - startTime) / 1000;
                            const currentSpeed = processed / elapsedTime;
                            const remainingEmails = totalEmails - processed;
                            const remainingSeconds = remainingEmails / (currentSpeed || 1);
                            const remainingTime = this.formatTime(remainingSeconds);
                            const eta = this.calculateETA(remainingSeconds);

                            progressCallback({
                                processed,
                                total: totalEmails,
                                current_speed: currentSpeed || 0,
                                remaining_emails: remainingEmails || 0,
                                remaining_time_formatted: remainingTime,
                                eta_formatted: eta
                            });
                        }

                        if (processed >= amount) {
                            logger.info(`Reached the requested amount of emails to fetch for Task ID: ${taskId}.`);
                            break;
                        }
                    } catch (msgError) {
                        logger.error(`Error fetching message ID ${message.id} for Task ID ${taskId}: ${msgError}`);
                        // Optionally, continue fetching other messages
                    }
                }

                if (processed >= amount) {
                    break;
                }

            } while (nextPageToken && processed < amount);

            logger.info(`Fetching completed for Task ID: ${taskId}.`);

            return emails;

        } catch (error) {
            if (error.message === 'Fetch aborted') {
                logger.info(`Fetch aborted for Task ID: ${taskId}`);
                throw error;
            } else {
                logger.error(`An error occurred in fetchEmails for Task ID ${taskId}:`, error);
                throw error;
            }
        }
    }

    /**
     * Helper method for fetching with retry logic.
     * @param {Function} fn - The function to execute with retry.
     * @param {AbortSignal} signal - The abort signal to control fetch abortion.
     * @returns {Promise<any>}
     */
    async fetchWithRetry(fn, signal) {
        let attempt = 0;
        const { maxRetries, baseDelay, maxDelay } = this.rateLimitConfig;

        while (attempt < maxRetries) {
            try {
                return await fn();
            } catch (error) {
                if (signal.aborted) {
                    throw new Error('Fetch aborted');
                }
                attempt++;
                if (attempt >= maxRetries) {
                    throw error;
                }
                const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
                logger.warn(`Retry attempt ${attempt} after error: ${error.message}. Waiting for ${delay}ms.`);
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
     * Decrypts the entire email results from a given file.
     * @param {string} filename - Path to the encrypted email results file.
     * @returns {Promise<Array>} - Resolves to an array of decrypted email data.
     */
    async decryptEmailResults(filename) {
        try {
            const encryptedContent = await this.dataPersistenceService.readFile(filename);
            const encryptedData = JSON.parse(encryptedContent);
            const decryptedString = this.encryptionService.decryptData(encryptedData);
            return JSON.parse(decryptedString);
        } catch (error) {
            logger.error('Error decrypting email results:', error);
            throw error;
        }
    }

    /**
     * Encrypts and saves the email results to a given file.
     * @param {string} filename - Path to the email results file.
     * @param {Array} emails - Array of email data to encrypt and save.
     * @returns {Promise<void>}
     */
    async encryptAndSaveEmailResults(filename, emails) {
        try {
            const encryptedData = this.encryptionService.encryptData(JSON.stringify(emails));
            await this.dataPersistenceService.writeFile(filename, JSON.stringify(encryptedData));
            logger.info('Email results encrypted and saved successfully.');
        } catch (error) {
            logger.error('Error encrypting and saving email results:', error);
            throw error;
        }
    }
}

module.exports = GmailFetchService;
