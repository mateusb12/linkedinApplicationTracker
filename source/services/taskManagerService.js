// services/TaskManagerService.js

const GmailFetchService = require('./gmailFetchService');
const gmailEncryptionService = require('./gmailEncryptionService');
const gmailDataPersistence = require('./gmailDataPersistence');
const logger = require('./logger');
const path = require('path');

class TaskManagerService {
    constructor() {
        this.tasks = {}; // Map taskId to task details
    }

    startTask(taskId, amount) {
        if (this.tasks[taskId]) {
            logger.warn(`Task with ID ${taskId} already exists.`);
            return;
        }

        const progress = {
            status: 'running',
            processed: 0,
            total: 0,
            emails: [],
            current_speed: 0,
            remaining_emails: 0,
            remaining_time_formatted: '',
            eta_formatted: ''
        };

        const abortController = new AbortController();
        const startTime = Date.now();

        const progressCallback = (update) => {
            Object.assign(progress, update);
        };

        const taskPromise = (async () => {
            try {
                const emails = await GmailFetchService.fetchEmails(
                    taskId,
                    amount,
                    abortController.signal,
                    progressCallback
                );

                progress.emails = emails;
                progress.processed = emails.length;
                progress.status = 'completed';

                // Encrypt and save data
                const dataToEncrypt = JSON.stringify(emails);
                const encryptedData = gmailEncryptionService.encryptData(dataToEncrypt);
                const resultsPath = path.join(__dirname, '../data/email_results.json');
                await gmailDataPersistence.saveData(encryptedData, resultsPath);

                logger.info(`Task ${taskId} completed successfully.`);
            } catch (error) {
                if (error.message === 'Fetch aborted') {
                    progress.status = 'aborted';
                    logger.info(`Task ${taskId} has been aborted.`);
                } else {
                    progress.status = 'error';
                    progress.error = error.message;
                    logger.error(`Error in task ${taskId}:`, error);
                }
            }
        })();

        this.tasks[taskId] = {
            progress,
            abortController,
            taskPromise
        };
    }

    stopTask(taskId) {
        if (this.tasks[taskId]) {
            const { progress, abortController } = this.tasks[taskId];
            progress.status = 'aborted';
            abortController.abort();
            logger.info(`Task ${taskId} has been stopped.`);
        } else {
            logger.warn(`Task with ID ${taskId} does not exist.`);
        }
    }

    getTaskProgress(taskId) {
        if (this.tasks[taskId]) {
            return this.tasks[taskId].progress;
        } else {
            logger.warn(`Task with ID ${taskId} does not exist.`);
            return null;
        }
    }

    // Optionally, clean up completed tasks
    cleanupTask(taskId) {
        if (this.tasks[taskId]) {
            delete this.tasks[taskId];
            logger.info(`Task ${taskId} has been cleaned up.`);
        } else {
            logger.warn(`Task with ID ${taskId} does not exist.`);
        }
    }
}

module.exports = new TaskManagerService();
