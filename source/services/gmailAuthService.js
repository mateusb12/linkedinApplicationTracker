// gmailAuthService.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { OAuth2Client } = require('google-auth-library');

const TOKEN_PATH = path.join(__dirname, '../tokens/token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../secrets/credentials.json');

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

// const isProduction = process.env.NODE_ENV === 'production';
//
// const redirectUri = process.env.REDIRECT_URI || 'http://localhost:3000/oauth2callback';

const redirectUri = process.env.REDIRECT_URI

const oauth2Client = new OAuth2Client(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    redirectUri
);

class GmailAuthService {
    constructor() {
        this.oAuth2Client = null;
        this.credentials = null;
        this.redirectUri = 'http://localhost:3000/oauth2callback';
        this.loadCredentials();
    }

    loadCredentials() {
        try {
            if (fs.existsSync(CREDENTIALS_PATH)) {
                const content = fs.readFileSync(CREDENTIALS_PATH);
                this.credentials = JSON.parse(content);
                
                const { client_secret, client_id } = this.credentials.installed || this.credentials.web;
                
                this.oAuth2Client = new google.auth.OAuth2(
                    client_id, client_secret, this.redirectUri
                );
            } else {
                // Attempt to load credentials from environment variables
                const client_id = process.env.CLIENT_ID;
                const client_secret = process.env.CLIENT_SECRET;

                if (client_id && client_secret) {
                    logger.info('Using credentials from environment variables');
                    this.oAuth2Client = new google.auth.OAuth2(
                        client_id, client_secret, this.redirectUri
                    );
                } else {
                    logger.error('No credentials found in file or environment variables');
                }
            }
        } catch (error) {
            logger.error('Error loading credentials:', error);
        }
    }

    isAuthenticated() {
        if (!this.oAuth2Client) return false;
        
        // Check if we have valid credentials with an access token
        const credentials = this.oAuth2Client.credentials;
        return !!(credentials && credentials.access_token);
    }

    generateAuthUrl(state) {
        if (!this.oAuth2Client) {
            logger.error('OAuth2Client is not initialized');
            return null;
        }

        try {
            console.log('Generating auth URL with redirect URI:', this.redirectUri);
            const url = this.oAuth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: SCOPES,
                state: state,
                prompt: 'consent',
                redirect_uri: this.redirectUri
            });
            console.log('Generated URL:', url);
            return url;
        } catch (error) {
            logger.error('Error generating auth URL:', error);
            return null;
        }
    }

    async getTokens(code) {
        try {
            const { tokens } = await this.oAuth2Client.getToken(code);
            this.oAuth2Client.setCredentials(tokens);
            return tokens;
        } catch (error) {
            logger.error('Error getting tokens:', error);
            throw error;
        }
    }

    setTokens(tokens) {
        if (!this.oAuth2Client) {
            this.loadCredentials();
        }
        if (!tokens || !tokens.access_token) {
            throw new Error('Invalid tokens provided');
        }
        this.oAuth2Client.setCredentials(tokens);
    }

    getOAuth2Client() {
        if (!this.oAuth2Client) {
            this.loadCredentials();
        }
        return this.oAuth2Client;
    }

    clearCredentials() {
        if (this.oAuth2Client) {
            this.oAuth2Client.credentials = null;
        }
    }
}

module.exports = new GmailAuthService();
