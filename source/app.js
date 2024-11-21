const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const favicon = require('serve-favicon');
const authService = require('./services/gmailAuthService');
const ApplicationTrackingService = require('./services/applicationTrackingService');
const fetchMetadataService = require('./services/fetchMetadataService');
const winston = require('winston');

const app = express();
const port = process.env.PORT || 8080;

// Middleware setup
app.set('views', path.join(__dirname, 'views'));
app.use(favicon(path.join(__dirname, '../public/images/email.png')));
app.use(express.static(path.join(__dirname, '../public')));
app.set('view engine', 'ejs'); // Using EJS as template engine

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'your_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize Winston logger
const logger = winston.createLogger({
    level: 'error',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log' }),
        new winston.transports.Console()
    ],
});

// Add this new middleware to handle CORS
app.use((req, res, next) => {
    const allowedOrigins = ['http://localhost:8080'];
    if (process.env.VERCEL_URL) {
        allowedOrigins.push(`https://${process.env.VERCEL_URL}`);
    }
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

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

app.get('/oauth2callback', async (req, res) => {
    console.log('Callback route hit!', { query: req.query });
    const { code, state } = req.query;

    if (state !== req.session.state) {
        logger.error('Invalid state parameter');
        return res.status(400).send('Invalid state parameter. Authentication failed.');
    }
    
    try {
        await authService.getAndSaveTokens(code);
        res.redirect('/');
    } catch (error) {
        logger.error('Error getting tokens:', error);
        res.status(500).send('Authentication failed. Please try again.');
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
        return res.status(401).send('Not authenticated. Please authenticate with Gmail.');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const gmailFetchService = require('./services/gmailFetchService');
    let emailCount = 0;

    // Extract the 'amount' parameter from the query string
    const amountParam = req.query.amount;
    console.log(`Requested amount: ${amountParam}`); // Log the requested amount

    let amount;
    if (amountParam === 'all') {
        amount = null; // Set to null to indicate 'fetch all'
    } else {
        amount = parseInt(amountParam, 10);
        if (isNaN(amount)) {
            amount = 100; // Only set default if parsing fails
        }
    }

    console.log(`Parsed amount: ${amount}`); // Log the parsed amount

    try {
        // Pass the 'amount' parameter to the fetchEmailsGenerator function
        for await (const update of gmailFetchService.fetchEmailsGenerator(amount)) {
            res.write(`data: ${update}\n\n`);
        }
        // Update metadata after successful fetch
        await fetchMetadataService.updateMetadata(emailCount);
    } catch (error) {
        logger.error('Error fetching emails:', error);
        res.write(`data: ${JSON.stringify({ error: 'An error occurred while fetching emails. Please try again later.' })}\n\n`);
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
        console.log('\n=== STARTING CHART GENERATION ===');
        const tracker = new ApplicationTrackingService();
        const viewType = req.body.viewType || 'week';
        
        // Load and decrypt the email data
        console.log('Loading email data...');
        const gmailFetchService = require('./services/gmailFetchService');
        const resultsPath = path.join(__dirname, 'data/email_results.json');
        
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

app.get('/applications_chart.png', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'applications_chart.png'));
});

// Route to revoke OAuth access
app.post('/revoke', async (req, res) => {
    try {
        const token = authService.oAuth2Client.credentials.access_token;
        if (!token) {
            return res.status(400).send('No access token found.');
        }
        await authService.oAuth2Client.revokeToken(token);
        // Delete token.json
        await fs.unlink(path.join(__dirname, 'tokens', 'token.json'));
        res.send('Access revoked successfully.');
    } catch (error) {
        logger.error('Error revoking access:', error);
        res.status(500).send('Failed to revoke access.');
    }
});

// Route to delete stored email data
app.delete('/delete-data', async (req, res) => {
    try {
        await fs.unlink(path.join(__dirname, 'data', 'email_results.json'));
        res.send('Data deleted successfully.');
    } catch (error) {
        logger.error('Error deleting data:', error);
        res.status(500).send('Failed to delete data.');
    }
});

// Add error handling middleware at the end of your middleware chain
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Add a catch-all route for undefined routes
app.use((req, res) => {
    res.status(404).send('Sorry, that route does not exist.');
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
    });
});

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        vercel: process.env.VERCEL === '1'
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});