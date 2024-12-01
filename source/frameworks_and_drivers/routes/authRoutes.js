const express = require('express');
const authService = require('../../application/services/gmailAuthService');
const crypto = require('crypto');

const router = express.Router();

// Update the auth route to use a simpler approach
router.get('/auth/gmail', (req, res) => {
    console.log('\n=== Starting OAuth Process ===');

    // Generate state
    const state = crypto.randomBytes(32).toString('hex');
    console.log('1. Generated State:', state.substring(0, 10) + '...');

    // Generate auth URL
    const authUrl = authService.generateAuthUrl(state);
    console.log('2. Auth URL generated:', authUrl);
    console.log('3. Redirect URI configured as:', authService.redirectUri);

    if (!authUrl) {
        return res.status(500).send('Failed to generate auth URL');
    }

    // Store state in a cookie instead of session
    res.cookie('oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 5 * 60 * 1000 // 5 minutes
    });

    res.redirect(authUrl);
});

// Update the callback route
router.get('/oauth2callback', async (req, res) => {
    console.log('OAuth callback received:', {
        hasCode: !!req.query.code,
        hasState: !!req.query.state,
        hasCookie: !!req.cookies.oauth_state
    });

    const { code, state } = req.query;
    const savedState = req.cookies.oauth_state;

    if (!state || !savedState || state !== savedState) {
        console.error('State mismatch or missing:', {
            receivedState: state,
            savedState: savedState
        });
        return res.status(400).send('Invalid state parameter. Please try again.');
    }

    try {
        console.log('Getting tokens from Google...');
        const tokens = await authService.getTokens(code);
        console.log('Tokens received:', {
            access_token: tokens.access_token ? 'exists' : 'missing',
            refresh_token: tokens.refresh_token ? 'exists' : 'missing',
            scope: tokens.scope,
            token_type: tokens.token_type,
            expiry_date: tokens.expiry_date
        });

        // Clear the state cookie
        res.clearCookie('oauth_state');

        // Set the tokens in the auth service immediately
        authService.setTokens(tokens);

        // Send a simple HTML page that stores tokens and redirects
        res.send(`
            <html>
                <body>
                    <script>
                        try {
                            const tokens = ${JSON.stringify(tokens)};
                            console.log('Storing tokens:', {
                                access_token: tokens.access_token ? 'exists' : 'missing',
                                refresh_token: tokens.refresh_token ? 'exists' : 'missing',
                                scope: tokens.scope,
                                token_type: tokens.token_type,
                                expiry_date: tokens.expiry_date
                            });
                            window.localStorage.setItem('gmail_tokens', JSON.stringify(tokens));
                            window.location.href = '/';
                        } catch (error) {
                            console.error('Error storing tokens:', error);
                            window.location.href = '/?error=token_storage_failed';
                        }
                    </script>
                    <p>Authentication successful! Redirecting...</p>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Token exchange failed:', error);
        res.status(500).send(`Authentication failed: ${error.message}`);
    }
});

module.exports = router;