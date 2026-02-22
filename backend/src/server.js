import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import Redis from 'ioredis';

// Load environment variables
import env from './config/env.js';

// Import services
import healthStateService from './services/health-evaluator.service.js';

// Import routes
import authRoutes from './routes/auth.routes.js';
import monitorRoutes from './routes/monitor.routes.js';
import incidentRoutes from './routes/incident.routes.js';
import statsRoutes from './routes/stats.routes.js';
import adminRoutes from './routes/admin.routes.js';
import maintenanceMode from './middlewares/maintenance.middleware.js';


// Import services
import schedulerService from './services/scheduler.service.js';
import connectDB from './config/db.js';

// Initialize express app
const app = express();
const httpServer = createServer(app);

// Trust proxy: Essential if behind Load Balancer/Proxy (Heroku, AWS, Nginx)
app.set('trust proxy', 1);

// Phase 6: JWT Middleware for Socket.IO
import jwt from 'jsonwebtoken';
import User from './models/User.js';

const io = new Server(httpServer, {
    cors: {
        origin: env.FRONTEND_URL,
        methods: ['GET', 'POST']
    }
});

// Phase 6: AUTHENTICATE ALL SOCKET CONNECTIONS
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication failed: Missing token'));

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return next(new Error('Authentication failed: Invalid user'));

        socket.user = user;
        next();
    } catch (err) {
        next(new Error('Authentication failed: ' + err.message));
    }
});

// Initialize health state service with Socket.IO instance
healthStateService.setIoInstance(io);

// Redis Stream Consumer for Reliable User Updates
// Replaces Pub/Sub to ensure no events are lost during high load/disconnects
const redisSubscriber = new Redis(env.REDIS_URL, {
    lazyConnect: true, // Use lazy connect to control timing manually
    connectTimeout: 20000,
    retryStrategy: (times) => Math.min(times * 500, 3000),
    maxRetriesPerRequest: null, // Required for some blocking operations if we add them later
    family: 4,
    db: 0
});

// Handle connection events
redisSubscriber.on('error', (err) => {
    console.warn('📡 Redis Stream Client Error:', err.message);
});

let redisSubscriberInitialized = false;
let streamConsumerRunning = false;
const STREAM_KEY = 'monitor_updates_stream';
const CONSUMER_GROUP = 'backend_servers_group';
const CONSUMER_NAME = `server_${process.pid}_${Math.random().toString(36).substring(7)}`;

async function initRedisStreamConsumer() {
    if (redisSubscriberInitialized) return;

    try {
        await redisSubscriber.connect();
        console.log('Redis stream client connected');

        // Create consumer group (ignore error if already exists)
        try {
            await redisSubscriber.xgroup('CREATE', STREAM_KEY, CONSUMER_GROUP, '$', 'MKSTREAM');
            console.log('✅ Created Redis Stream Consumer Group');
        } catch (err) {
            if (!err.message.includes('BUSYGROUP')) {
                console.warn('⚠️ Group creation warning:', err.message);
            }
        }

        redisSubscriberInitialized = true;
        startStreamProcessing();
    } catch (err) {
        console.error('Failed to initialize Redis Stream:', err.message);
        setTimeout(initRedisStreamConsumer, 3000);
    }
}

async function startStreamProcessing() {
    if (streamConsumerRunning) return;
    streamConsumerRunning = true;
    console.log(`🚀 Starting Stream Processing as ${CONSUMER_NAME}`);

    while (streamConsumerRunning) {
        try {
            // Read new messages for this group
            // BLOCK 5000ms: Long polling for efficiency
            const response = await redisSubscriber.xreadgroup(
                'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
                'BLOCK', 5000,
                'COUNT', 10,
                'STREAMS', STREAM_KEY, '>'
            );

            if (response) {
                // response format: [[streamKey, [[id, [field, value, ...]], ...]]]
                const streamData = response[0][1];

                if (streamData && streamData.length > 0) {
                    for (const [id, fields] of streamData) {
                        // Parse flattened fields array: [key1, val1, key2, val2...]
                        const messageData = {};
                        for (let i = 0; i < fields.length; i += 2) {
                            messageData[fields[i]] = fields[i + 1];
                        }

                        if (messageData.userId && messageData.data) {
                            try {
                                const payload = JSON.parse(messageData.data);
                                // Relay to user via Socket.IO
                                io.to(`user_${messageData.userId}`).emit('monitor_update', payload);

                                // Acknowledge message processed
                                await redisSubscriber.xack(STREAM_KEY, CONSUMER_GROUP, id);
                            } catch (parseErr) {
                                console.error('Error parsing stream message:', parseErr, messageData);
                                // Ack anyway to not get stuck? Or move to DLQ? 
                                // For now, Ack to avoid loops
                                await redisSubscriber.xack(STREAM_KEY, CONSUMER_GROUP, id);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error('❌ Stream Processing Error:', err.message);
            // Wait a bit before retrying loop to avoid tight failure loops
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

// Security Middleware: Helmet for secure HTTP headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", env.FRONTEND_URL, "wss:", "https:"],
            upgradeInsecureRequests: [],
        },
    },
}));

// Security Middleware: Prevent HTTP Parameter Pollution
app.use(hpp());

// Security Middleware: Rate Limiter for API protection (IP-based)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter);
app.use('/api/', maintenanceMode); // Phase 11: Global maintenance mode enforcement



// Middleware
app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true
}));
// Middleware - Phase 7: Payload size limits for DoS protection
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Real-time latency middleware: Measure API response time
app.use((req, res, next) => {
    req.startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - req.startTime;
        if (req.path !== '/health') {
            console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
        }
    });
    next();
});



// Enhanced Health Check: Reports DB and Scheduler status
app.get('/health', async (req, res) => {
    try {
        // Check database connection status
        const dbStates = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };
        const dbStatus = dbStates[mongoose.connection.readyState] || 'unknown';
        const isDbHealthy = mongoose.connection.readyState === 1;

        // Check scheduler status - Enhanced with isReady check
        const schedulerHealthy = schedulerService.isMaster !== undefined && schedulerService.isReady;

        // Overall status
        const overallStatus = (isDbHealthy && schedulerHealthy) ? 'UP' : 'DEGRADED';

        if (overallStatus === 'DEGRADED') {
            console.warn(`[Health-Check] Returning 503 DEGRADED. DB: ${dbStatus}, Scheduler: ${schedulerHealthy ? 'ready' : 'not-ready/init'}`);
        }

        res.status(isDbHealthy && schedulerHealthy ? 200 : 503).json({
            success: true,
            status: overallStatus,
            services: {
                database: {
                    status: dbStatus,
                    healthy: isDbHealthy
                },
                server: 'UP',
                scheduler: {
                    status: schedulerService.isMaster !== undefined ? (schedulerHealthy ? 'running' : 'initializing') : 'offline',
                    healthy: schedulerHealthy,
                    isMaster: schedulerService.isMaster
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Health-Check] Critical Failure:', error.message);
        res.status(503).json({
            success: false,
            status: 'DOWN',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});


// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/monitors', monitorRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/stats', statsRoutes); // Stats Routes
// Mount Admin Routes (Isolated)
app.use('/api/admin', adminRoutes);


// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id, 'User:', socket.user._id);

    // SECURITY FIX: User joins their own room automatically using auth context
    socket.join(`user_${socket.user._id}`);
    console.log(`User ${socket.user._id} securely joined their room`);

    // Security: Limit listeners to prevent leaks
    socket.setMaxListeners(5);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        socket.removeAllListeners(); // Explicit cleanup
    });
});

// Pass Socket.IO instance to scheduler
schedulerService.setIO(io);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Start server
const startServer = async () => {
    try {
        // Connect to database
        await connectDB();

        // Start HTTP server
        httpServer.listen(env.PORT, () => {
            console.log(`Server running on port ${env.PORT}`);
        });

        // Initialize Redis Stream Consumer (Reliable Event Processing)
        initRedisStreamConsumer();

        // Initialize Scheduler
        await schedulerService.initialize();

    } catch (error) {
        console.error('Server startup error:', error);
        process.exit(1);
    }
};

// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
    try {
        console.log(`${signal} received, shutting down gracefully...`);

        // Close Redis subscriber first (if connected)
        if (redisSubscriber && redisSubscriber.status === 'ready') {
            try {
                await redisSubscriber.quit();
                console.log('Redis subscriber closed');
            } catch (err) {
                console.warn('Error closing Redis subscriber:', err.message);
            }
        }

        // Shutdown BullMQ scheduler
        try { await schedulerService.shutdown(); } catch (e) { console.warn('Error stopping scheduler:', e); }

        // Close HTTP server
        await new Promise((resolve, reject) => {
            httpServer.close((err) => {
                if (err) return reject(err);
                console.log('Server closed');
                resolve();
            });
        });

        // Disconnect mongoose (promise-based)
        try {
            await mongoose.disconnect();
            console.log('MongoDB connection closed');
        } catch (err) {
            console.warn('Error closing MongoDB connection:', err);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error during graceful shutdown:', err);
        process.exit(1);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server only if not in test mode
if (process.env.NODE_ENV !== 'test') {
    startServer();
}

export { startServer, gracefulShutdown, redisSubscriber };
export default app;
