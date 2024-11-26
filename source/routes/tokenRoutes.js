// routes/tokenRoutes.js
const express = require('express');
const authService = require("../services/gmailAuthService");
const { clearCredentials } = require('../services/authService');

const router = express.Router();


// Move this BEFORE any error handlers and catch-all routes
router.post('/set-tokens', express.json(), (req, res) => {
    try {
        console.log('Received token setting request');

        if (!req.body || !req.body.access_token) {
            console.error('Invalid token data received:', req.body);
            return res.status(400).json({
                error: 'Invalid token data',
                details: 'Token data must include access_token'
            });
        }

        console.log('Setting tokens in auth service');
        authService.setTokens(req.body);

        // Verify the tokens were set correctly
        if (!authService.isAuthenticated()) {
            console.error('Token setting failed verification');
            return res.status(500).json({
                error: 'Token setting failed verification'
            });
        }

        console.log('Tokens set successfully');
        res.status(200).json({
            success: true,
            message: 'Tokens set successfully'
        });
    } catch (error) {
        console.error('Error setting tokens:', error);
        res.status(500).json({
            error: 'Failed to set tokens',
            details: error.message
        });
    }
});

router.post('/revoke', async (req, res) => {
    try {
        const storedTokens = req.body.tokens;
        if (!storedTokens || !storedTokens.access_token) {
            return res.status(400).json({
                error: 'No access token provided in request'
            });
        }

        const oauth2Client = authService.getOAuth2Client();
        oauth2Client.setCredentials(storedTokens);

        try {
            // Try to revoke the token with Google
            await oauth2Client.revokeToken(storedTokens.access_token);
        } catch (revokeError) {
            console.warn('Warning: Error revoking token with Google:', revokeError);
            // Continue anyway as we want to clear local state
        }

        // Clear credentials from the OAuth client
        await clearCredentials();

        res.status(200).json({
            success: true,
            message: 'Access revoked successfully'
        });

    } catch (error) {
        console.error('Error in revoke endpoint:', error);
        res.status(500).json({
            error: 'Failed to revoke access',
            details: error.message
        });
    }
});

// Add new route to verify authentication status
router.get('/verify-auth', (req, res) => {
    try {
        if (authService.isAuthenticated()) {
            res.status(200).json({ authenticated: true });
        } else {
            res.status(401).json({ authenticated: false });
        }
    } catch (error) {
        logger.error('Error verifying authentication:', error);
        res.status(500).json({ error: 'Failed to verify authentication' });
    }
});

module.exports = router

