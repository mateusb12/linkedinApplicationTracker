// services/TaskManagerService.js
const logger = require('./logger');
const path = require('path');
const {tasks} = require("googleapis/build/src/apis/tasks");
const {setKey, getKey} = require("../../external_services/redisService");

class TaskManagerService {
    constructor(gmailFetchService, encryptionService, dataPersistenceService) {
        this.gmailFetchService = gmailFetchService;
        this.encryptionService = encryptionService;
        this.dataPersistenceService = dataPersistenceService;
        this.tasks = {}; // Map taskId to task details
        this.abortControllers = {};
    }

    async startTask(taskId, amount) {
        const existingTask = tasks[taskId];
        if (existingTask) {
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

        // Initialize task in Redis
        await setKey(`task:${taskId}`, progress);

        const abortController = new AbortController();
        const startTime = Date.now();

        const progressCallback = async (update) => {
            Object.assign(progress, update);
            const currentProgress = await getKey(`task:${taskId}`);
            const updatedProgress = {...currentProgress, ...update};
            await setKey(`task:${taskId}`, updatedProgress);
        };

        const taskPromise = (async () => {
            try {
                const emails = await this.gmailFetchService.fetchEmails(
                    taskId,
                    amount,
                    abortController.signal,
                    async (update) => {
                        await progressCallback(update);
                    }
                );

                progress.emails = emails;
                progress.processed = emails.length;
                progress.status = 'completed';

                // Encrypt and save data
                const encryptedData = this.encryptionService.encryptData(JSON.stringify(emails));
                const resultsPath = path.join(__dirname, '../data/email_results.json');
                await this.dataPersistenceService.saveData(encryptedData, resultsPath);

                logger.info(`Task ${taskId} completed successfully.`);
            } catch (error) {
                if (error.message === 'Fetch aborted') {
                    await progressCallback({ status: 'aborted' });
                    progress.status = 'aborted';
                    logger.info(`Task ${taskId} has been aborted.`);
                } else {
                    await progressCallback({ status: 'error', error: error.message })
                    progress.status = 'error';
                    progress.error = error.message;
                    logger.error(`Error in task ${taskId}:`, error);
                }
            } finally {
                delete this.abortControllers[taskId];
            }
        })();

        // Optionally, you can track taskPromise if needed

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
            return true;
        } else {
            logger.warn(`Task with ID ${taskId} does not exist.`);
            return false;
        }
    }

    getTaskProgress(taskId) {
        const existingTask = this.tasks[taskId]
        if (existingTask) {
            return existingTask.progress;
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

module.exports = TaskManagerService;
