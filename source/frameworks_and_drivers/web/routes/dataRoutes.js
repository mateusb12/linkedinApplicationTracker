// routes/dataRoutes.js
const express = require('express');
const authService = require("../../../application/services/gmailAuthService");
const fetchMetadataService = require("../../../application/services/fetchMetadataService");
const compression = require("compression");
const fs = require("fs");
const path = require("path");
const logger = require('../../../application/services/logger');
const { v4: uuidv4 } = require('uuid'); // Import UUID generator
const TaskManagerService = require('../../../application/services/taskManagerService'); // Import TaskManagerService

const router = express.Router();

// Middleware to check authentication
const ensureAuthenticated = (req, res, next) => {
    if (!authService.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
};

router.use(compression());

// Route to fetch metadata
router.get('/fetch-metadata', ensureAuthenticated, async (req, res) => {
    try {
        res.socket.setNoDelay(true);
        const metadata = await fetchMetadataService.getMetadata();
        res.json(metadata);
    } catch (error) {
        logger.error('Error fetching metadata:', error);
        res.status(500).json({ error: 'Failed to fetch metadata.' });
    }
});

// Route to start fetching emails
router.post('/fetch_emails', ensureAuthenticated, express.json(), async (req, res) => {
    const { amount } = req.body; // Expecting JSON body with 'amount'

    if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount provided.' });
    }

    try {
        const taskId = uuidv4(); // Generate a unique task ID
        TaskManagerService.startTask(taskId, amount); // Start the task
        res.json({ taskId });
    } catch (error) {
        logger.error('Error starting email fetch:', error);
        res.status(500).json({ error: 'Failed to start email fetching.' });
    }
});

// Route to get progress of a specific task
router.get('/fetch_progress/:taskId', ensureAuthenticated, async (req, res) => {
    const { taskId } = req.params;
    logger.debug(`Received fetch_progress request for Task ID: ${taskId}`);

    try {
        const progress = TaskManagerService.getTaskProgress(taskId);
        logger.debug(`Progress retrieved for Task ID ${taskId}:`, progress);

        if (!progress) {
            logger.warn(`Task ID: ${taskId} not found in TaskManager`);
            return res.status(404).json({ error: 'Task ID not found.' });
        }

        res.status(200).json({
            processed: progress.processed,
            total: progress.total,
            current_speed: progress.current_speed,
            remaining_emails: progress.remaining_emails,
            eta_formatted: progress.eta_formatted,
            status: progress.status,
            error: progress.error
        });
    } catch (error) {
        logger.error(`Error retrieving progress for Task ID ${taskId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve task progress.' });
    }
});

// Route to stop an ongoing fetch task
router.post('/stop_fetch', ensureAuthenticated, express.json(), async (req, res) => {
    const { taskId } = req.body;

    if (!taskId) {
        return res.status(400).json({ error: 'Task ID is required.' });
    }

    try {
        TaskManagerService.stopTask(taskId); // Stop the task
        res.status(200).json({
            success: true,
            message: 'Fetch aborted successfully.'
        });
    } catch (error) {
        logger.error('Error stopping email fetch:', error);
        res.status(500).json({ error: 'Failed to stop email fetching.' });
    }
});

// Route to delete persisted email data
router.delete('/delete-data', ensureAuthenticated, async (req, res) => {
    const resultsPath = path.join(__dirname, '..', 'data', 'email_results.json');

    try {
        if (fs.existsSync(resultsPath)) {
            await fs.promises.unlink(resultsPath);
            logger.info('Email results data deleted successfully.');
            res.send('Data deleted successfully.');
        } else {
            logger.warn('Email results data file does not exist.');
            res.status(404).send('Data file not found.');
        }
    } catch (error) {
        logger.error('Error deleting data:', error);
        res.status(500).send('Failed to delete data.');
    }
});

module.exports = router;
