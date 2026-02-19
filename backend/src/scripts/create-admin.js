import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const createAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📦 Connected to MongoDB');

        const email = process.argv[2];
        const password = process.argv[3] || 'Admin@123';
        const name = process.argv[4] || 'Admin User';

        if (!email) {
            console.log('Usage: node create-admin.js <email> [password] [name]');
            process.exit(1);
        }

        const user = await User.findOne({ email });

        if (user) {
            // Promote existing user
            user.role = 'admin';
            user.name = name; // Update name if provided
            await user.save();
            console.log(`✅ User ${user.name} (${email}) promoted to ADMIN`);
        } else {
            // Create new admin
            const newAdmin = await User.create({
                name,
                email,
                password,
                role: 'admin'
            });
            console.log(`✅ Created new ADMIN user: ${email} (${name})`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

createAdmin();
