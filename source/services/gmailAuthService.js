// gmailAuthService.js
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');
const tokenStore = require('./tokenStore'); // Import the tokenStore module

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
        scope: SCOPES,
        state: state,
    });
}

// Function to get tokens
async function getTokens(code) {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
}

// Function to set tokens
async function setTokens(tokens) {
    oauth2Client.setCredentials(tokens);
    // Save tokens to persistent storage
    try {
        await tokenStore.saveTokens(tokens);
        logger.debug('Tokens saved to persistent storage.');
    } catch (err) {
        logger.error('Error saving tokens:', err);
    }
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

// Function to clear credentials
async function clearCredentials() {
    try {
        await tokenStore.clearTokens();
        oauth2Client.setCredentials({});
        console.log('Credentials cleared successfully.');
    } catch (err) {
        console.error('Error clearing credentials:', err);
    }
}

// Load tokens from persistent storage if available
async function loadTokens() {
    try {
        const tokens = await tokenStore.loadTokens();
        oauth2Client.setCredentials(tokens);
        logger.debug('Tokens loaded from persistent storage and set to OAuth2 client.');
    } catch (err) {
        logger.warn('No tokens found, user needs to authenticate.');
    }
}

// Immediately load tokens when the module is loaded
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
