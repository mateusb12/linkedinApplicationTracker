const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GmailAuthService {
    constructor() {
        const CLIENT_SECRETS_FILE = path.join(__dirname, '../gmail_analysis/credentials.json');
        const credentials = JSON.parse(fs.readFileSync(CLIENT_SECRETS_FILE));
        const { client_secret, client_id } = credentials.web;

        this.oauth2Client = new google.auth.OAuth2(
            client_id,
            client_secret,
            'http://localhost:8080/oauth2callback'
        );
        this.SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
    }

    generateAuthUrl(state) {
        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: this.SCOPES,
            include_granted_scopes: true,
            state: state
        });
    }

    async getAndSaveTokens(code) {
        const { tokens } = await this.oauth2Client.getToken(code);
        this.oauth2Client.setCredentials(tokens);
        fs.writeFileSync('token.json', JSON.stringify(tokens));
        return tokens;
    }

    isAuthenticated() {
        return fs.existsSync('token.json');
    }

    getOAuth2Client() {
        return this.oauth2Client;
    }
}

module.exports = new GmailAuthService();