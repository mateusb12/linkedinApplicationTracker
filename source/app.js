const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const favicon = require('serve-favicon');
const authService = require('./services/gmailAuthService');
const ApplicationTrackingService = require('./services/applicationTrackingService');
const fetchMetadataService = require('./services/fetchMetadataService');
const winston = require('winston');
const crypto = require('crypto');

const app = express();

// Middleware setup
app.set('views', path.join(__dirname, 'views'));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Update the session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    },
    proxy: process.env.NODE_ENV === 'production'
}));

// Add this right after your session middleware!
app.set('trust proxy', 1);

// Initialize Winston logger!
const logger = winston.createLogger({
    level: 'error',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console()
    ],
});

// Only add file logging in development environment
if (process.env.NODE_ENV === 'development') {
    try {
        // Create logs directory if it doesn't exist
        if (!fs.existsSync(path.join(__dirname, 'logs'))) {
            fs.mkdirSync(path.join(__dirname, 'logs'));
        }
        logger.add(new winston.transports.File({ 
            filename: path.join(__dirname, 'logs', 'error.log')
        }));
    } catch (error) {
        console.error('Failed to setup file logging:', error);
    }
}

// Add this new middleware to handle CORS
app.use((req, res, next) => {
    const allowedOrigins = ['http://localhost:3000'];
    if (process.env.VERCEL_URL) {
        allowedOrigins.push(`https://${process.env.VERCEL_URL}`);
    }
    if (process.env.PRODUCTION_URL) {
        allowedOrigins.push(process.env.PRODUCTION_URL);
    }
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Routes
app.get('/', (req, res) => {
    const authenticated = authService.isAuthenticated();
    res.render('index', { authenticated });
});

app.get('/auth/gmail', (req, res) => {
    console.log('\n=== Starting OAuth Process ===');
    
    // Generate state and log it
    const state = crypto.randomBytes(32).toString('hex');
    console.log('1. Generated State:', state.substring(0, 10) + '...');
    
    // Generate auth URL
    const authUrl = authService.generateAuthUrl(state);
    console.log('2. Auth URL generated:', authUrl ? 'Success' : 'Failed');
    
    if (!authUrl) {
        logger.error('Failed to generate auth URL');
        return res.status(500).send('Failed to generate auth URL');
    }

    // Save state to session
    req.session.state = state;
    req.session.cookie.created = new Date();
    
    console.log('3. Session Details:', {
        sessionID: req.sessionID,
        cookie: {
            maxAge: req.session.cookie.maxAge,
            secure: req.session.cookie.secure,
            httpOnly: req.session.cookie.httpOnly
        }
    });

    // Ensure session is saved before redirect
    req.session.save((err) => {
        if (err) {
            logger.error('Failed to save session:', err);
            return res.status(500).send('Error starting authentication process');
        }
        console.log('4. Session saved successfully, redirecting to Google');
        res.redirect(authUrl);
    });
});

app.get('/oauth2callback', async (req, res) => {
    console.log('\n=== OAuth Callback Debug Info ===');
    console.log('1. Request Query Parameters:', {
        state: req.query.state,
        code: req.query.code ? 'Present' : 'Missing',
        fullQuery: req.query
    });
    
    console.log('2. Session Information:', {
        sessionExists: req.session ? 'Yes' : 'No',
        sessionState: req.session?.state,
        sessionID: req.sessionID,
        cookie: req.session?.cookie
    });

    console.log('3. Request Headers:', {
        origin: req.headers.origin,
        referer: req.headers.referer,
        host: req.headers.host
    });

    const { code, state } = req.query;

    // Detailed validation checks
    if (!state) {
        logger.error('State parameter missing in request');
        return res.status(400).send('Error: No state parameter received in callback');
    }

    if (!req.session) {
        logger.error('No session found in request');
        return res.status(400).send('Error: No session found. Please try authenticating again');
    }

    if (!req.session.state) {
        logger.error('No state found in session', {
            sessionID: req.sessionID,
            sessionContent: req.session
        });
        return res.status(400).send('Error: No state found in session. Please try authenticating again');
    }

    if (state !== req.session.state) {
        logger.error('State parameter mismatch', {
            receivedState: state,
            sessionState: req.session.state,
            sessionID: req.sessionID,
            timeDifference: new Date() - new Date(req.session.cookie.created)
        });
        return res.status(400).send(`Error: State mismatch. 
            Received: ${state.substring(0, 10)}..., 
            Expected: ${req.session.state.substring(0, 10)}...`);
    }

    try {
        console.log('4. Attempting to get tokens with code');
        await authService.getAndSaveTokens(code);
        console.log('5. Successfully obtained and saved tokens');
        
        // Clear the state from session after successful use
        delete req.session.state;
        
        // Ensure session changes are saved before redirect
        req.session.save((err) => {
            if (err) {
                logger.error('Error saving session after OAuth:', err);
            }
            console.log('6. Redirecting to home page');
            res.redirect('/');
        });
    } catch (error) {
        logger.error('Token exchange failed:', {
            error: error.message,
            stack: error.stack,
            code: error.code
        });
        res.status(500).send(`Authentication failed: ${error.message}. Please try again.`);
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
    res.sendFile(path.join(__dirname, 'data', 'applications_chart.png'));
});

// Route to revoke OAuth access
app.post('/revoke', async (req, res) => {
    try {
        const token = authService.oAuth2Client.credentials.access_token;
        if (!token) {
            return res.status(400).send('No access token found.');
        }
        await authService.oAuth2Client.revokeToken(token);
        
        if (process.env.NODE_ENV === 'production') {
            // In production, clear the token from memory
            authService.token = null;
            // If using environment variable
            // delete process.env.OAUTH_TOKEN;
        } else {
            // In development, delete the token file
            await fs.unlink(path.join(__dirname, 'tokens', 'token.json'));
        }
        
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

app.get('/_health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        vercel: true
    });
});

module.exports = app;

if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}