
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
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    }
};

const checkMonitor = async () => {
    await connectDB();
    try {
        const monitorId = '69808289b7911a016bde60b8';
        console.log(`Checking Monitor ID: ${monitorId}`);

        const monitor = await Monitor.findById(monitorId);
        if (!monitor) {
            console.log('❌ Monitor NOT FOUND in Database');
        } else {
            console.log('✅ Monitor FOUND');
            console.log(`Name: ${monitor.name}`);
            console.log(`Owner ID: ${monitor.user}`);

            const user = await User.findById(monitor.user);
            console.log(`Owner Email: ${user ? user.email : 'UNKNOWN USER'}`);
        }

        // Also list all monitors for 'sanath' just in case
        const sanath = await User.findOne({ email: { $regex: 'sanath', $options: 'i' } });
        if (sanath) {
            console.log(`\nLikely User Found: ${sanath.email} (${sanath._id})`);
            const monitors = await Monitor.find({ user: sanath._id });
            console.log(`User has ${monitors.length} monitors:`);
            monitors.forEach(m => console.log(` - ${m.name} (${m._id})`));
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

checkMonitor();
