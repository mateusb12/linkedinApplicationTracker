// gmailAuthService.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

const TOKEN_PATH = path.join(__dirname, '../tokens/token.json');

// Define OAuth 2.0 scopes with clear documentation
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly' // Scope to read Gmail messages for fetching job-related emails
];

// Initialize Winston logger for Gmail Auth Service
const logger = winston.createLogger({
    level: 'error',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console()
    ]
});

// Only add file logging in development environment
if (process.env.NODE_ENV === 'development') {
    try {
        const logsDir = path.join(__dirname, '..', 'logs');
        
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        logger.add(new winston.transports.File({ 
            filename: path.join(logsDir, 'gmail-auth.log')
        }));
    } catch (error) {
        console.error('Failed to setup file logging in Gmail Auth Service:', error);
    }
}

// Load environment variables if not already loaded
require('dotenv').config();

// Define REDIRECT_URI from environment variables
const rawRedirectUri = process.env.REDIRECT_URI;
const redirectUri = rawRedirectUri.replace(/:\d+/, `:${process.env.PORT}`);
if (!redirectUri) {
    throw new Error('REDIRECT_URI is not defined in environment variables');
}

// Initialize OAuth2 client with redirectUri
const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    redirectUri
);

// Function to generate Auth URL
function generateAuthUrl(state) {
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/gmail.readonly'],
        state: state,
    });
}

// Function to get tokens
async function getTokens(code) {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
}

// Function to set tokens
function setTokens(tokens) {
    oauth2Client.setCredentials(tokens);
    // Save tokens to disk
    fs.writeFile(TOKEN_PATH, JSON.stringify(tokens), (err) => {
        if (err) {
            logger.error('Error saving tokens to file:', err);
        } else {
            logger.debug('Tokens saved to file:', TOKEN_PATH);
        }
    });
}

// Function to check authentication status
function isAuthenticated() {
    const credentials = oauth2Client.credentials;
    return credentials && credentials.access_token;
}

// Function to get OAuth2 client
function getOAuth2Client() {
    return oauth2Client;
}

// Add this function to clear credentials
async function clearCredentials() {
    try {
        const fs = require('fs').promises;
        await fs.unlink(TOKEN_PATH);
        console.log('Credentials cleared successfully.');
    } catch (err) {
        console.error('Error unlinking credentials:', err);
        // Handle the error appropriately
    }
}

// Load tokens from disk if available
async function loadTokens() {
    try {
        const data = await fs.promises.readFile(TOKEN_PATH, 'utf8');
        const tokens = JSON.parse(data);
        setTokens(tokens);
        logger.debug('Tokens loaded from file and set to OAuth2 client.');
    } catch (err) {
        logger.warn('No tokens found, user needs to authenticate.');
    }
}

loadTokens();

// Export necessary functions and redirectUri
module.exports = {
    generateAuthUrl,
    getTokens,
    setTokens,
    isAuthenticated,
    getOAuth2Client,
    clearCredentials,
    redirectUri,
};
