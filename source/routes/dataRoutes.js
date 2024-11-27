// routes/dataRoutes.js
const express = require('express')
const authService = require("../services/gmailAuthService");
const fetchMetadataService = require("../services/fetchMetadataService");
const compression = require("compression");
const GmailFetchService = require("../services/gmailFetchService");
const fs = require("fs");
const path = require("path");
const logger = require('../services/logger');

const router = express.Router();


router.get('/fetch-metadata', async (req, res) => {
    if (!authService.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    res.socket.setNoDelay(true);

    const metadata = await fetchMetadataService.getMetadata();
    res.json(metadata);
});


router.post('/fetch_emails', async (req, res) => {
    const { amount } = req.body; // Expecting JSON body with 'amount'

    if (!authService.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const taskId = GmailFetchService.startFetching(amount);
        res.json({ taskId });
    } catch (error) {
        logger.error('Error starting email fetch:', error);
        res.status(500).json({ error: 'Failed to start email fetching.' });
    }
});

router.get('/fetch_progress/:taskId', async (req, res) => {
    const { taskId } = req.params;
    logger.debug(`Received fetch_progress request for Task ID: ${taskId}`);

    const progress = GmailFetchService.getProgress(taskId);
    logger.debug(`Progress retrieved for Task ID ${taskId}:`, progress);

    if (!progress) {
        logger.warn(`Task ID: ${taskId} not found in progressStore`);
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
});

router.delete('/delete-data', async (req, res) => {
    try {
        await fs.unlink(path.join(__dirname, 'data', 'email_results.json'));
        res.send('Data deleted successfully.');
    } catch (error) {
        logger.error('Error deleting data:', error);
        res.status(500).send('Failed to delete data.');
    }
});

router.post('/stop_fetch', express.json(), async (req, res) => {
    const { taskId } = req.body;

    if (!authService.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!taskId) {
        return res.status(400).json({ error: 'Task ID is required.' });
    }

    try {
        const success = GmailFetchService.stopFetching(taskId);
        if (success) {
            res.status(200).json({
                success: true,
                message: 'Fetch aborted successfully.'
            });
        } else {
            res.status(400).json({
                error: 'Invalid Task ID or no active fetch found for the provided Task ID.'
            });
        }
    } catch (error) {
        logger.error('Error stopping email fetch:', error);
        res.status(500).json({ error: 'Failed to stop email fetching.' });
    }
});

module.exports = router