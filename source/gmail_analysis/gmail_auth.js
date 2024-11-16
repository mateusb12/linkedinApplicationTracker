const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const { authenticate } = require('@google-cloud/local-auth');

// If modifying these scopes, delete the token.json file
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

async function gmailAuthenticate() {
  let credentials = null;
  try {
    // Check if we have previously stored token
    const tokenPath = path.join(process.cwd(), 'token.json');
    try {
      const token = await fs.readFile(tokenPath);
      credentials = JSON.parse(token);
    } catch (err) {
      // Token doesn't exist or is invalid
    }

    // If no valid credentials, authenticate
    if (!credentials) {
      const credentialsPath = path.join(process.cwd(), 'credentials.json');
      credentials = await authenticate({
        scopes: SCOPES,
        keyfilePath: credentialsPath,
      });

      // Save the credentials
      await fs.writeFile(tokenPath, JSON.stringify(credentials));
    }

    return google.auth.fromJSON(credentials);
  } catch (error) {
    console.error('Error during authentication:', error);
    throw error;
  }
}

async function main() {
  try {
    const auth = await gmailAuthenticate();
    console.log('Authentication successful:', auth);
  } catch (error) {
    console.error('Authentication failed:', error);
  }
}

if (require.main === module) {
  main();
}

module.exports = { gmailAuthenticate };