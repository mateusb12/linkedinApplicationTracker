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

// Enhanced Winston logger configuration
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        // Error logs
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Info logs
        new winston.transports.File({ 
            filename: 'logs/combined.log',
            maxsize: 5242880,
            maxFiles: 5,
        }),
        // Console output for development
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ],
    // Handle uncaught exceptions
    exceptionHandlers: [
        new winston.transports.File({ filename: 'logs/exceptions.log' })
    ]
});

// Add debug logging for development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
        level: 'debug'
    }));
}

class GmailAuthService {
    constructor() {
        this.oAuth2Client = null;
        this.credentials = null;
        this.redirectUri = 'http://localhost:8080/oauth2callback';
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
        if (this.oAuth2Client && fs.existsSync(TOKEN_PATH)) {
            const token = fs.readFileSync(TOKEN_PATH);
            this.oAuth2Client.setCredentials(JSON.parse(token));
            return true;
        }
        return false;
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

    async getAndSaveTokens(code) {
        try {
            const { tokens } = await this.oAuth2Client.getToken(code);
            this.oAuth2Client.setCredentials(tokens);
            
            // Create tokens directory if it doesn't exist
            const tokensDir = path.dirname(TOKEN_PATH);
            if (!fs.existsSync(tokensDir)) {
                fs.mkdirSync(tokensDir, { recursive: true });
            }
            
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        } catch (error) {
            logger.error('Error getting and saving tokens:', error);
            throw error; // Re-throw to handle in calling function
        }
    }

    getOAuth2Client() {
        if (!this.oAuth2Client) {
            this.loadCredentials();
        }
        if (fs.existsSync(TOKEN_PATH)) {
            const token = fs.readFileSync(TOKEN_PATH);
            this.oAuth2Client.setCredentials(JSON.parse(token));
        }
        return this.oAuth2Client;
    }
}

module.exports = new GmailAuthService();
