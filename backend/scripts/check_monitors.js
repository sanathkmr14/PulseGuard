
import mongoose from 'mongoose';
import Monitor from '../src/models/Monitor.js';
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
        console.log('MongoDB Connected');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

const checkData = async () => {
    await connectDB();

    try {
        const users = await User.find({});
        console.log(`Found ${users.length} users.`);

        for (const user of users) {
            const monitorCount = await Monitor.countDocuments({ user: user._id });
            console.log(`User: ${user.email} (ID: ${user._id}) -> Monitors: ${monitorCount}`);
        }

    } catch (error) {
        console.error('Error checking data:', error);
    } finally {
        await mongoose.disconnect();
    }
};

checkData();
