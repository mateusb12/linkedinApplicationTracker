const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// OAuth2 setup
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const CLIENT_SECRETS_FILE = path.join(__dirname, 'credentials.json');

const credentials = JSON.parse(fs.readFileSync(CLIENT_SECRETS_FILE));
const { client_secret, client_id, redirect_uris } = credentials.web;

const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    'http://localhost:8080/oauth2callback'
);

function generateAuthUrl(state) {
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        include_granted_scopes: true,
        state: state
    });
}

async function getAndSaveTokens(code) {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync('token.json', JSON.stringify(tokens));
    return tokens;
}

function isAuthenticated() {
    return fs.existsSync('token.json');
}

module.exports = {
    oauth2Client,
    generateAuthUrl,
    getAndSaveTokens,
    isAuthenticated
};