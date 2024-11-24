const express = require('express');
const fs = require('fs');
const path = require('path');
const authService = require('./services/gmailAuthService');
const ApplicationTrackingService = require('./services/applicationTrackingService');
const fetchMetadataService = require('./services/fetchMetadataService');
const winston = require('winston');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();

// Basic middleware setup
app.set('views', path.join(__dirname, 'views'));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Update the auth route to use a simpler approach
app.get('/auth/gmail', (req, res) => {
    console.log('\n=== Starting OAuth Process ===');
    
    // Generate state
    const state = crypto.randomBytes(32).toString('hex');
    console.log('1. Generated State:', state.substring(0, 10) + '...');
    
    // Generate auth URL
    const authUrl = authService.generateAuthUrl(state);
    console.log('2. Auth URL generated:', authUrl);
    console.log('3. Redirect URI configured as:', authService.redirectUri);
    
    if (!authUrl) {
        return res.status(500).send('Failed to generate auth URL');
    }

    // Store state in a cookie instead of session
    res.cookie('oauth_state', state, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 5 * 60 * 1000 // 5 minutes
    });

    res.redirect(authUrl);
});

// Update the callback route
app.get('/oauth2callback', async (req, res) => {
    console.log('OAuth callback received:', {
        hasCode: !!req.query.code,
        hasState: !!req.query.state,
        hasCookie: !!req.cookies.oauth_state
    });

    const { code, state } = req.query;
    const savedState = req.cookies.oauth_state;

    if (!state || !savedState || state !== savedState) {
        console.error('State mismatch or missing:', {
            receivedState: state,
            savedState: savedState
        });
        return res.status(400).send('Invalid state parameter. Please try again.');
    }

    try {
        console.log('Getting tokens from Google...');
        const tokens = await authService.getTokens(code);
        console.log('Tokens received:', {
            access_token: tokens.access_token ? 'exists' : 'missing',
            refresh_token: tokens.refresh_token ? 'exists' : 'missing',
            scope: tokens.scope,
            token_type: tokens.token_type,
            expiry_date: tokens.expiry_date
        });
        
        // Clear the state cookie
        res.clearCookie('oauth_state');
        
        // Set the tokens in the auth service immediately
        authService.setTokens(tokens);
        
        // Send a simple HTML page that stores tokens and redirects
        res.send(`
            <html>
                <body>
                    <script>
                        try {
                            const tokens = ${JSON.stringify(tokens)};
                            console.log('Storing tokens:', {
                                access_token: tokens.access_token ? 'exists' : 'missing',
                                refresh_token: tokens.refresh_token ? 'exists' : 'missing',
                                scope: tokens.scope,
                                token_type: tokens.token_type,
                                expiry_date: tokens.expiry_date
                            });
                            window.localStorage.setItem('gmail_tokens', JSON.stringify(tokens));
                            window.location.href = '/';
                        } catch (error) {
                            console.error('Error storing tokens:', error);
                            window.location.href = '/?error=token_storage_failed';
                        }
                    </script>
                    <p>Authentication successful! Redirecting...</p>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Token exchange failed:', error);
        res.status(500).send(`Authentication failed: ${error.message}`);
    }
});

// Routes
app.get('/', (req, res) => {
    // Don't check authentication here since it's managed client-side
    res.render('index', { authenticated: false });
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

// Update the revoke route
app.post('/revoke', async (req, res) => {
    try {
        const storedTokens = req.body.tokens;
        if (!storedTokens || !storedTokens.access_token) {
            return res.status(400).json({ 
                error: 'No access token provided in request' 
            });
        }

        const oauth2Client = authService.getOAuth2Client();
        oauth2Client.setCredentials(storedTokens);

        try {
            // Try to revoke the token with Google
            await oauth2Client.revokeToken(storedTokens.access_token);
        } catch (revokeError) {
            console.warn('Warning: Error revoking token with Google:', revokeError);
            // Continue anyway as we want to clear local state
        }
        
        // Clear credentials from the OAuth client
        authService.clearCredentials();
        
        res.status(200).json({ 
            success: true, 
            message: 'Access revoked successfully' 
        });
        
    } catch (error) {
        console.error('Error in revoke endpoint:', error);
        res.status(500).json({ 
            error: 'Failed to revoke access',
            details: error.message 
        });
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

// Move this BEFORE any error handlers and catch-all routes
app.post('/set-tokens', express.json(), (req, res) => {
    try {
        console.log('Received token setting request');
        
        if (!req.body || !req.body.access_token) {
            console.error('Invalid token data received:', req.body);
            return res.status(400).json({ 
                error: 'Invalid token data',
                details: 'Token data must include access_token'
            });
        }

        console.log('Setting tokens in auth service');
        authService.setTokens(req.body);
        
        // Verify the tokens were set correctly
        if (!authService.isAuthenticated()) {
            console.error('Token setting failed verification');
            return res.status(500).json({ 
                error: 'Token setting failed verification' 
            });
        }

        console.log('Tokens set successfully');
        res.status(200).json({ 
            success: true,
            message: 'Tokens set successfully'
        });
    } catch (error) {
        console.error('Error setting tokens:', error);
        res.status(500).json({ 
            error: 'Failed to set tokens',
            details: error.message 
        });
    }
});

// Add new route to verify authentication status
app.get('/verify-auth', (req, res) => {
    try {
        if (authService.isAuthenticated()) {
            res.status(200).json({ authenticated: true });
        } else {
            res.status(401).json({ authenticated: false });
        }
    } catch (error) {
        logger.error('Error verifying authentication:', error);
        res.status(500).json({ error: 'Failed to verify authentication' });
    }
});

// THEN add your error handlers and catch-all route
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

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