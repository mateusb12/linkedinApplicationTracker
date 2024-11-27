// app.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const authService = require('./services/gmailAuthService');
const cookieParser = require('cookie-parser');
const favicon = require('serve-favicon');
const compression = require('compression');
const cors = require('cors');

// Load environment variables
require('dotenv').config();

// API Instance
const app = express();

// Set up view engine and static files
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use('/static', express.static(path.join(__dirname, 'static')));
app.use(express.static(path.join(__dirname, 'static')));
app.use(favicon(path.join(__dirname, 'static', 'images', 'email.png')));

// Parse incoming requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Custom middleware
const requestLogger = require('./middleware/requestLogger');
app.use(requestLogger);

// Compress responses
app.use(compression());

// Enable CORS for frontend running on localhost:3000
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));

// Routes
const authRoutes = require('./routes/authRoutes');
const dataRoutes = require('./routes/dataRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const tokenRoutes = require('./routes/tokenRoutes');

app.use(authRoutes);
app.use(dataRoutes);
app.use(applicationRoutes);
app.use(tokenRoutes);

// Main Route
app.get('/', async (req, res) => {
    try {
        const isAuthenticated = authService.isAuthenticated();
        res.render('index', { authenticated: isAuthenticated });
    } catch (error) {
        logger.error('Error checking authentication status:', error);
        res.render('index', { authenticated: false });
    }
});

// Health Check Route
app.get('/health', (req, res) => {
    console.log('Health check route accessed');
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
    });
});

// Error Handlers (should be at the end)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.use((req, res) => {
    res.status(404).send('Sorry, that route does not exist.');
});

module.exports = app;

// Start Server in Development
if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}