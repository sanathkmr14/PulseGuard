import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom format for console output with colors and emojis
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] ${level}: ${message}${metaStr}`;
    })
);

// JSON format for file/production logging
const jsonFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Determine log level from environment
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Create the logger with multiple transports
const logger = winston.createLogger({
    level: logLevel,
    defaultMeta: { service: 'pulseguard' },
    transports: [
        // Console transport (always enabled)
        new winston.transports.Console({
            format: process.env.NODE_ENV === 'production' ? jsonFormat : consoleFormat
        })
    ]
});

// Add file transport in production
if (process.env.NODE_ENV === 'production' && process.env.LOG_TO_FILE === 'true') {
    const logsDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');

    // Error logs
    logger.add(new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: jsonFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }));

    // Combined logs
    logger.add(new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: jsonFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }));
}

// Helper methods for structured logging with context
logger.monitor = (action, monitorName, data = {}) => {
    logger.info(`[Monitor] ${action}: ${monitorName}`, { type: 'monitor', monitor: monitorName, ...data });
};

logger.check = (protocol, url, status, responseTime, data = {}) => {
    const icon = status === 'UP' ? '✅' : status === 'DOWN' ? '❌' : '⚠️';
    logger.info(`${icon} [${protocol}] ${url} → ${status} (${responseTime}ms)`, {
        type: 'check', protocol, url, status, responseTime, ...data
    });
};

logger.alert = (level, message, monitorName, data = {}) => {
    const logFn = level === 'CRITICAL' ? 'error' : level === 'WARNING' ? 'warn' : 'info';
    logger[logFn](`🚨 ALERT [${level}]: ${message}`, { type: 'alert', level, monitor: monitorName, ...data });
};

logger.scheduler = (action, data = {}) => {
    logger.info(`📦 [Scheduler] ${action}`, { type: 'scheduler', ...data });
};

logger.api = (method, path, statusCode, duration, data = {}) => {
    logger.debug(`${method} ${path} - ${statusCode} - ${duration}ms`, {
        type: 'api', method, path, statusCode, duration, ...data
    });
};

// Stream for Morgan HTTP logger (if needed)
logger.stream = {
    write: (message) => {
        logger.http(message.trim());
    }
};

export default logger;
