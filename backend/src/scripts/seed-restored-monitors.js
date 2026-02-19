import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Monitor from '../models/Monitor.js';
import Incident from '../models/Incident.js';
import Check from '../models/Check.js';

dotenv.config();

const seedMonitors = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');

        // Find Suresh
        const suresh = await User.findOne({ email: 'suresh@gmail.com' });
        const sanath = await User.findOne({ email: 'sanathkumarp6@gmail.com' });

        if (!suresh && !sanath) {
            console.log('Users not found, please run restore-users.js first');
            process.exit(1);
        }

        // Cleanup existing monitors for these users (to avoid duplicates if run multiple times)
        const userIds = [];
        if (suresh) userIds.push(suresh._id);
        if (sanath) userIds.push(sanath._id);

        const existingMonitors = await Monitor.find({ user: { $in: userIds } });
        const monitorIds = existingMonitors.map(m => m._id);

        await Monitor.deleteMany({ _id: { $in: monitorIds } });
        await Check.deleteMany({ monitor: { $in: monitorIds } });
        await Incident.deleteMany({ monitor: { $in: monitorIds } });
        console.log('Cleaned up existing sample data');

        // created sample monitors
        const monitorsToCreate = [];

        if (suresh) {
            monitorsToCreate.push({
                user: suresh._id,
                name: 'Suresh Portfolio',
                url: 'https://sureshmaster.com',
                type: 'HTTPS',
                isActive: true,
                status: 'up',
                lastCheck: new Date()
            });
            monitorsToCreate.push({
                user: suresh._id,
                name: 'Dev API',
                url: 'https://api.dev.local',
                type: 'HTTP',
                isActive: false, // Paused
                status: 'paused',
                lastCheck: new Date()
            });
        }

        if (sanath) {
            monitorsToCreate.push({
                user: sanath._id,
                name: 'Production Server',
                url: 'https://prod.server.io',
                type: 'TCP',
                isActive: true,
                status: 'down',
                lastCheck: new Date()
            });
        }

        const createdMonitors = await Monitor.create(monitorsToCreate);
        console.log(`Created ${createdMonitors.length} monitors`);

        // Create Checks and Incidents
        for (const mon of createdMonitors) {
            if (mon.status === 'up') {
                await Check.create({
                    monitor: mon._id,
                    statusCode: 200,
                    responseTime: 120,
                    status: 'up'
                });
            } else if (mon.status === 'down') {
                await Check.create({
                    monitor: mon._id,
                    statusCode: 503,
                    responseTime: 0,
                    status: 'down',
                    error: 'Connection timeout'
                });
                await Incident.create({
                    monitor: mon._id,
                    type: 'down',
                    startTime: new Date(),
                    acknowledged: false
                });
            }
        }

        console.log('Sample monitors seeded successfully');
        process.exit(0);
    } catch (error) {
        console.error('Seeding error:', error);
        process.exit(1);
    }
};

seedMonitors();
