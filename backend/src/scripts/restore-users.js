import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Monitor from '../models/Monitor.js';
import Incident from '../models/Incident.js';
import Check from '../models/Check.js';

dotenv.config();

const restoreData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');

        // 1. Delete the "Seed" users (John, Jane, Robert)
        await User.deleteMany({ email: { $in: ['john@example.com', 'jane@company.com', 'robert@tech.io'] } });
        console.log('Deleted seed users');

        // 2. Clear Monitors/Incidents created by seed (cleanup)
        const seedMonitors = await Monitor.find({ name: { $in: ['Marketing Site', 'API Server'] } });
        if (seedMonitors.length > 0) {
            await Monitor.deleteMany({ _id: { $in: seedMonitors.map(m => m._id) } });
            await Check.deleteMany({ monitor: { $in: seedMonitors.map(m => m._id) } });
            await Incident.deleteMany({ monitor: { $in: seedMonitors.map(m => m._id) } });
            console.log('Deleted seed monitors and data');
        }

        // 3. Prepare Original Users
        const usersToRestore = [
            {
                _id: new mongoose.Types.ObjectId("6976150e97db7b35053557ba"),
                name: "Suresh",
                email: "suresh@gmail.com",
                password: "$2a$10$ETyJ6PntSPoUSHM47IA3R.jUM1VhiPsbxDHnByeyRm4peY78XiJ/y",
                role: "user",
                isBanned: false,
                notificationPreferences: { email: true, slack: false, sms: false, webhook: false },
                createdAt: new Date("2026-01-25T13:05:18.982Z"),
                updatedAt: new Date("2026-01-26T08:01:06.851Z"),
                __v: 0
            },
            {
                _id: new mongoose.Types.ObjectId("697cd5ab42b5d23c74d58d41"),
                name: "Sanath",
                email: "sanathkumarp6@gmail.com",
                password: "$2a$10$nSEceKrCvhQAnx3Dmst1MOuPCwEdASl9A58bBvSY2Vvszo0fvzfhO",
                role: "user",
                isBanned: false,
                notificationPreferences: { email: true, slack: false, sms: false, webhook: false },
                createdAt: new Date("2026-01-30T16:00:43.571Z"),
                updatedAt: new Date("2026-01-30T16:05:10.155Z"),
                __v: 0
            }
        ];

        const adminUser = {
            _id: new mongoose.Types.ObjectId("697dcb2f918d003c347b1fee"),
            name: "Pulse Guard AdminPage",
            email: "pulseguardadmin@gmail.com",
            role: "admin",
            password: "$2a$10$T/9sQL6xxhfgss03IMpDj.4TziEFpOXUc5Q.Bfzg0WxR740N5PGay",
            createdAt: new Date("2026-01-31T09:28:15.227Z"),
            updatedAt: new Date("2026-01-31T09:28:15.227Z"),
            __v: 0
        };

        // Check if admin exists
        const existingAdmin = await User.findById(adminUser._id);
        if (!existingAdmin) {
            usersToRestore.push(adminUser);
        } else {
            console.log("Admin user already exists, skipping restore for admin.");
        }

        // 4. Upsert Users (Insert or Update) to prevent duplicate key errors
        if (usersToRestore.length > 0) {
            const bulkOps = usersToRestore.map(user => ({
                updateOne: {
                    filter: { _id: user._id },
                    update: { $set: user },
                    upsert: true
                }
            }));
            const result = await User.collection.bulkWrite(bulkOps);
            console.log(`Restored users successfully. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}, Upserted: ${result.upsertedCount}`);
        }

        process.exit(0);
    } catch (error) {
        console.error('Restore error:', error);
        process.exit(1);
    }
};

restoreData();
