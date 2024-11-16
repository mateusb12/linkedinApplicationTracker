const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const favicon = require('serve-favicon');

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

// OAuth2 setup
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const CLIENT_SECRETS_FILE = path.join(__dirname, 'gmail_analysis/credentials.json'); // Update path as needed

const credentials = JSON.parse(fs.readFileSync(CLIENT_SECRETS_FILE));
const { client_secret, client_id, redirect_uris } = credentials.web;

const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    'http://localhost:8080/oauth2callback' // Explicitly set redirect URI
);

// Routes
app.get('/', (req, res) => {
    const authenticated = fs.existsSync('token.json');
    res.render('index', { authenticated });
});

app.get('/call_function', (req, res) => {
    const state = Math.random().toString(36).substring(7);
    req.session.state = state;
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        include_granted_scopes: true,
        state: state // Use the same state
    });
    res.redirect(authUrl);
});

app.get('/oauth2callback', async (req, res) => {
    const { code, state } = req.query;

    if (state !== req.session.state) {
        return res.status(400).send('Invalid state parameter');
    }
    
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        
        // Save the tokens
        fs.writeFileSync('token.json', JSON.stringify(tokens));
        res.redirect('/');
    } catch (error) {
        console.error('Error getting tokens:', error);
        res.redirect('/');
    }
});

app.get('/fetch_emails', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const fetchEmails = async () => {
        // Implementation of email fetching logic goes here
        // You'll need to implement the equivalent of fetch_emails_generator()
        // Example:
        const progress = 'Fetching emails...';
        res.write(`data: ${progress}\n\n`);
    };

    fetchEmails().catch(console.error);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});