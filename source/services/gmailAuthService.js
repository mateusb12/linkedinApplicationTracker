// gmailAuthService.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

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

const isProduction = process.env.NODE_ENV === 'production';

class GmailAuthService {
    constructor() {
        this.oAuth2Client = null;
        this.credentials = null;
        this.redirectUri = process.env.OAUTH_REDIRECT_URI || 'http://localhost:8080/oauth2callback';
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
        return !!this.oAuth2Client?.credentials;
    }

    generateAuthUrl(state) {
        if (!this.oAuth2Client) {
            logger.error('OAuth2Client is not initialized');
            return null;
        }

        try {
            return this.oAuth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: SCOPES,
                state: state,
                prompt: 'consent'
            });
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
        this.oAuth2Client.setCredentials(tokens);
    }

    getOAuth2Client() {
        if (!this.oAuth2Client) {
            this.loadCredentials();
        }
        
        return this.oAuth2Client;
    }
}

module.exports = new GmailAuthService();
