const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const favicon = require('serve-favicon');
const authService = require('./services/gmailAuthService');

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

app.get('/fetch_emails', async (req, res) => {
    if (!authService.isAuthenticated()) {
        return res.status(401).send('Not authenticated');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const gmailFetchService = require('./services/gmailFetchService');

    try {
        for await (const update of gmailFetchService.fetchEmailsGenerator()) {
            res.write(`data: ${update}\n\n`);
        }
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});