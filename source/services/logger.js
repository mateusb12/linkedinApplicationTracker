const { createLogger, format, transports } = require('winston');
const path = require('path');

// Determine the environment
const isProduction = process.env.NODE_ENV === 'production';

// Define log formats
const logFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(
        info => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`
    )
);

// Initialize transports
const loggerTransports = [];

// In production, use only console transport
if (isProduction) {
    loggerTransports.push(
        new transports.Console({
            level: 'info',
            format: format.combine(
                format.colorize(),
                logFormat
            )
        })
    );
} else {
    // In development, use both console and file transports
    loggerTransports.push(
        new transports.Console({
            level: 'debug',
            format: format.combine(
                format.colorize(),
                logFormat
            )
        }),
        new transports.File({
            filename: path.join(__dirname, '../../logs/error.log'),
            level: 'error',
            format: logFormat,
            handleExceptions: true,
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        new transports.File({
            filename: path.join(__dirname, '../../logs/combined.log'),
            level: 'info',
            format: logFormat,
            handleExceptions: true,
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    );
}

const logger = createLogger({
    level: isProduction ? 'info' : 'debug',
    format: logFormat,
    transports: loggerTransports,
    exitOnError: false
});

module.exports = logger; 