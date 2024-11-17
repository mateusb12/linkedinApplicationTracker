const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const favicon = require('serve-favicon');
const authService = require('./services/gmailAuthService');
const ApplicationTrackingService = require('./services/applicationTrackingService');
const fetchMetadataService = require('./services/fetchMetadataService');

const app = express();
const port = 8080;

// Middleware setup
app.set('views', path.join(__dirname, 'views'));
app.use(favicon(path.join(__dirname, '../public/images/email.png')));
app.use(express.static(path.join(__dirname, '../public')));
app.set('view engine', 'ejs'); // Using EJS as template engine

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Routes
app.get('/', (req, res) => {
    const authenticated = authService.isAuthenticated();
    res.render('index', { authenticated });
});

app.get('/auth/gmail', (req, res) => {
    console.log('Starting auth process...');
    const state = Math.random().toString(36).substring(7);
    const authUrl = authService.generateAuthUrl(state);
    console.log('Auth URL generated:', authUrl);
    if (!authUrl) {
        return res.status(500).send('Failed to generate auth URL');
    }
    req.session.state = state;
    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    console.log('Callback route hit!', { query: req.query });
    const { code, state } = req.query;

    if (state !== req.session.state) {
        return res.status(400).send('Invalid state parameter');
    }
    
    try {
        await authService.getAndSaveTokens(code);
        res.redirect('/');
    } catch (error) {
        console.error('Error getting tokens:', error);
        res.redirect('/');
    }
});

app.get('/fetch-metadata', async (req, res) => {
    if (!authService.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const metadata = await fetchMetadataService.getMetadata();
    res.json(metadata);
});

app.get('/fetch_emails', async (req, res) => {
    if (!authService.isAuthenticated()) {
        return res.status(401).send('Not authenticated');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const gmailFetchService = require('./services/gmailFetchService');
    let emailCount = 0;

    try {
        for await (const update of gmailFetchService.fetchEmailsGenerator()) {
            res.write(`data: ${update}\n\n`);
            
            // Count processed emails
            const data = JSON.parse(update);
            if (data.emails_processed && data.total_emails) {
                emailCount = data.total_emails;
            }
        }
        // Update metadata after successful fetch
        await fetchMetadataService.updateMetadata(emailCount);
    } catch (error) {
        console.error('Error fetching emails:', error);
        res.write(`data: ${JSON.stringify({ error: 'Error fetching emails' })}\n\n`);
    } finally {
        res.end();
    }
});

app.get('/test', (req, res) => {
    res.send('Test route working!');
});

app.post('/generate-application-chart', async (req, res) => {
    if (!authService.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const tracker = new ApplicationTrackingService();
        const viewType = req.body.viewType || 'week'; // Default to weekly view
        
        // Load the email data
        const data = await tracker.loadData('email_results.json');
        const applicationCounts = tracker.countApplications(data);

        if (applicationCounts.size === 0) {
            return res.status(404).json({ error: 'No application data found' });
        }

        const countsDict = tracker.aggregateCounts(applicationCounts);
        const { labels, values, level } = tracker.determinePlotData(countsDict, viewType);

        // Generate the chart and save it to public directory
        await tracker.generateChart(labels, values, level);

        res.json({ success: true });
    } catch (error) {
        console.error('Error generating chart:', error);
        res.status(500).json({ error: 'Failed to generate chart' });
    }
});

app.get('/applications_chart.png', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'applications_chart.png'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});