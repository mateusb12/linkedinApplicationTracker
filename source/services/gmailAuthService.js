// gmailAuthService.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, '../tokens/token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../secrets/credentials.json');

class GmailAuthService {
    constructor() {
        this.oAuth2Client = null;
        this.credentials = null;
        this.loadCredentials();
    }

    loadCredentials() {
        try {
            if (fs.existsSync(CREDENTIALS_PATH)) {
                const content = fs.readFileSync(CREDENTIALS_PATH);
                this.credentials = JSON.parse(content);
                console.log('Loaded credentials from:', CREDENTIALS_PATH);
                
                const { client_secret, client_id, redirect_uris } = this.credentials.installed || this.credentials.web;
                console.log('Redirect URIs from credentials:', redirect_uris);
                
                this.oAuth2Client = new google.auth.OAuth2(
                    client_id, client_secret, redirect_uris[0]
                );
            } else {
                console.error('Error: Credentials file not found at:', CREDENTIALS_PATH);
            }
        } catch (error) {
            console.error('Error loading credentials:', error);
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
            console.error('OAuth2Client is not initialized');
            return null;
        }

        try {
            const url = this.oAuth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: ['https://www.googleapis.com/auth/gmail.readonly'],
                state: state,
                prompt: 'consent'
            });
            console.log('Redirect URIs:', this.credentials.installed?.redirect_uris || this.credentials.web?.redirect_uris);
            console.log('Generated Auth URL:', url);
            return url;
        } catch (error) {
            console.error('Error generating auth URL:', error);
            return null;
        }
    }

    async getAndSaveTokens(code) {
        const { tokens } = await this.oAuth2Client.getToken(code);
        this.oAuth2Client.setCredentials(tokens);
        
        // Create tokens directory if it doesn't exist
        const tokensDir = path.dirname(TOKEN_PATH);
        if (!fs.existsSync(tokensDir)) {
            fs.mkdirSync(tokensDir, { recursive: true });
        }
        
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
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
