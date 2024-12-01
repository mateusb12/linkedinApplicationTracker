// routes/applicationRoutes.js
const express = require('express')
const authService = require("../../application/services/gmailAuthService");
const ApplicationTrackingService = require("../../application/services/applicationTrackingService");
const path = require("path");
const gmailFetchService = require("../../application/services/gmailFetchService");

const router = express.Router();

router.post('/generate-linkedin-application-chart', async (req, res) => {
    if (!authService.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        console.log('\n=== STARTING CHART GENERATION ===');
        const tracker = new ApplicationTrackingService();
        const viewType = req.body.viewType || 'week';

        // Load and decrypt the email data
        console.log('Loading email data...');
        const resultsPath = path.join(__dirname, '..', '..', 'application', 'data', 'email_results.json');

        console.log('\n=== ATTEMPTING DECRYPTION ===');
        console.log('Reading from:', resultsPath);

        try {
            const decryptedData = await gmailFetchService.decryptEmailResults(resultsPath);
            console.log('\nDecryption successful!');
            console.log('Decrypted data type:', typeof decryptedData);
            console.log('Is array?:', Array.isArray(decryptedData));
            console.log('First item:', JSON.stringify(decryptedData[0], null, 2));

            const applicationCounts = tracker.countApplications(decryptedData);
            const countsDict = tracker.aggregateCounts(applicationCounts);
            const { labels, values, level } = tracker.determinePlotData(countsDict, viewType);

            // Generate the chart and save it
            await tracker.generateChart(labels, values, level);
            res.json({ success: true });

        } catch (decryptError) {
            console.error('\n=== DECRYPTION ERROR DETAILS ===');
            console.error('Error name:', decryptError.name);
            console.error('Error message:', decryptError.message);
            console.error('Stack trace:', decryptError.stack);
            throw decryptError;
        }
    } catch (error) {
        console.error('Error generating chart:', error);
        res.status(500).json({ error: 'Failed to generate chart: ' + error.message });
    }
});

router.get('/applications_chart.png', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'application', 'data', 'applications_chart.png'));
});

module.exports = router