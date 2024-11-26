// routes/dataRoutes.js
const express = require('express')
const authService = require("../services/gmailAuthService");
const fetchMetadataService = require("../services/fetchMetadataService");
const compression = require("compression");
const GmailFetchService = require("../services/gmailFetchService");

const router = express.Router();


router.get('/fetch-metadata', async (req, res) => {
    if (!authService.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    res.socket.setNoDelay(true);

    const metadata = await fetchMetadataService.getMetadata();
    res.json(metadata);
});


router.get('/fetch_emails', compression({ filter: () => false }), async (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Flush headers to establish SSE with client

    // Disable Nagle's algorithm
    res.socket.setNoDelay(true);

    const amount = req.query.amount ? parseInt(req.query.amount, 10) : null;

    try {
        const emailGenerator = GmailFetchService.fetchEmailsGenerator(amount);

        for await (const chunk of emailGenerator) {
            // Send each chunk as an SSE event
            res.write(`data: ${chunk}\n\n`);
            res.flush(); // Flush after each write
        }

        // Send a final comment to indicate the end of the stream
        res.write(`: Completed\n\n`);
        res.end();
    } catch (error) {
        console.error('Error in /fetch_emails endpoint:', error);
        res.write(`data: ${JSON.stringify({ error: 'An error occurred while fetching emails.' })}\n\n`);
        res.end();
    }
});

module.exports = router