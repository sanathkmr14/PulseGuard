import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Monitor from '../models/Monitor.js';
import Incident from '../models/Incident.js';
import Check from '../models/Check.js';

dotenv.config();

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');

        // Clear existing non-admin data
        await User.deleteMany({ role: 'user' });
        await Monitor.deleteMany({});
        await Incident.deleteMany({});
        await Check.deleteMany({});

        console.log('Cleared existing data');

        // Create Users
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('password123', salt);

        const users = await User.create([
            {
                name: 'John Doe',
                email: 'john@example.com',
                password: hashedPassword,
                role: 'user',
                isBanned: false
            },
            {
                name: 'Jane Smith',
                email: 'jane@company.com',
                password: hashedPassword,
                role: 'user',
                isBanned: false
            },
            {
                name: 'Robert Johnson',
                email: 'robert@tech.io',
                password: hashedPassword,
                role: 'user',
                isBanned: true
            }
        ]);

        console.log(`Created ${users.length} users`);

        // Create Monitors for John
        const john = users[0];
        const monitors = await Monitor.create([
            {
                user: john._id,
                name: 'Marketing Site',
                url: 'https://example.com',
                type: 'HTTP',
                isActive: true,
                status: 'up',
                lastCheck: new Date()
            },
            {
                user: john._id,
                name: 'API Server',
                url: 'https://api.example.com',
                type: 'HTTP',
                isActive: true,
                status: 'down',
                lastCheck: new Date()
            }
        ]);

        console.log(`Created ${monitors.length} monitors`);

        // Create Incidents
        await Incident.create([
            {
                monitor: monitors[1]._id,
                type: 'down',
                startTime: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
                acknowledged: false
            }
        ]);

        // Create Checks (Logs)
        await Check.create([
            {
                monitor: monitors[0]._id,
                statusCode: 200,
                responseTime: 120,
                status: 'up'
            },
            {
                monitor: monitors[0]._id,
                statusCode: 200,
                responseTime: 145,
                status: 'up'
            },
            {
                monitor: monitors[1]._id,
                statusCode: 500,
                responseTime: 50,
                status: 'down',
                error: 'Internal Server Error'
            }
        ]);

        console.log('Seed completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Seed error:', error);
        process.exit(1);
    }
};

seedData();
