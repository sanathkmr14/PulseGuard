import mongoose from 'mongoose';
import Monitor from '../src/models/Monitor.js';
import Check from '../src/models/Check.js';
import User from '../src/models/User.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected\n');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        process.exit(1);
    }
};

const formatTime = (date) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = Math.floor((now - new Date(date)) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
};

const verifyMonitors = async () => {
    await connectDB();

    try {
        console.log('📊 MONITOR VERIFICATION REPORT\n');
        console.log('='.repeat(80));

        const users = await User.find({});
        console.log(`Found ${users.length} user(s)\n`);

        let totalMonitors = 0;
        let totalChecks = 0;

        for (const user of users) {
            const monitors = await Monitor.find({ user: user._id }).lean();
            
            if (monitors.length === 0) {
                console.log(`👤 User: ${user.email}`);
                console.log(`   └─ No monitors configured\n`);
                continue;
            }

            console.log(`👤 User: ${user.email}`);
            console.log(`   Total Monitors: ${monitors.length}\n`);

            for (const monitor of monitors) {
                totalMonitors++;
                console.log(`   📍 Monitor: ${monitor.name}`);
                console.log(`       Type: ${monitor.type}`);
                console.log(`       URL: ${monitor.url}`);
                console.log(`       Port: ${monitor.port || 'default'}`);
                console.log(`       Interval: ${monitor.interval} min`);
                console.log(`       Timeout: ${monitor.timeout}ms`);
                console.log(`       Status: ${monitor.status || 'unknown'}`);
                console.log(`       Consecutive Failures: ${monitor.consecutiveFailures || 0}`);
                console.log(`       Last Checked: ${formatTime(monitor.lastChecked)}`);
                
                // Get recent checks
                const recentChecks = await Check.find({ monitor: monitor._id })
                    .sort({ timestamp: -1 })
                    .limit(5)
                    .lean();

                totalChecks += recentChecks.length;

                if (recentChecks.length > 0) {
                    console.log(`       📋 Recent Checks (last 5):`);
                    recentChecks.forEach((check, idx) => {
                        const statusEmoji = check.statusCode >= 200 && check.statusCode < 300 ? '✅' : 
                                           check.statusCode >= 400 ? '❌' : '⚠️';
                        console.log(`           ${idx + 1}. ${statusEmoji} Status: ${check.statusCode || 'N/A'} | Response: ${check.responseTime}ms | ${formatTime(check.timestamp)}`);
                    });
                } else {
                    console.log(`       📋 No checks recorded yet`);
                }
                console.log();
            }
        }

        console.log('='.repeat(80));
        console.log(`\n📈 SUMMARY:`);
        console.log(`   Total Monitors: ${totalMonitors}`);
        console.log(`   Total Checks Recorded: ${totalChecks}`);
        
        if (totalMonitors > 0) {
            const avgChecksPerMonitor = (totalChecks / totalMonitors).toFixed(1);
            console.log(`   Avg Checks per Monitor: ${avgChecksPerMonitor}`);
        }

        // Check scheduler status
        console.log(`\n🔧 SCHEDULER STATUS:`);
        try {
            const Redis = (await import('ioredis')).default;
            const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
            
            const queueSize = await redis.llen('bull:monitor-queue:wait');
            const activeJobs = await redis.llen('bull:monitor-queue:active');
            const completedJobs = await redis.get('bull:monitor-queue:completed');
            const failedJobs = await redis.get('bull:monitor-queue:failed');
            
            console.log(`   Queue Size: ${queueSize} pending jobs`);
            console.log(`   Active Jobs: ${activeJobs}`);
            console.log(`   Completed Jobs: ${completedJobs || 0}`);
            console.log(`   Failed Jobs: ${failedJobs || 0}`);
            
            await redis.disconnect();
        } catch (redisErr) {
            console.log(`   ⚠️  Could not connect to Redis: ${redisErr.message}`);
        }

    } catch (error) {
        console.error('❌ Error during verification:', error);
    } finally {
        await mongoose.disconnect();
    }
};

verifyMonitors();
