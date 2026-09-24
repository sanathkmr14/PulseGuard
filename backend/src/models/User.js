import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters'] // [H1]
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: [254, 'Email cannot exceed 254 characters'], // [H1] RFC 5321 max
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [8, 'Password must be at least 8 characters'], // [H4] Raised from 6 → 8 (NIST SP 800-63B)
    select: false
  },
  notificationPreferences: {
    email: {
      type: Boolean,
      default: true
    },
    slack: {
      type: Boolean,
      default: false
    },
    sms: {
      type: Boolean,
      default: false
    },
    webhook: {
      type: Boolean,
      default: false
    }
  },
  slackWebhook: {
    type: String,
    default: '',
    maxlength: [500, 'Slack webhook URL too long'], // [H1]
    validate: {
      validator: v => !v || /^https:\/\/.+/.test(v),
      message: 'Slack webhook must be a valid HTTPS URL'
    }
  },
  phoneNumber: {
    type: String,
    default: '',
    maxlength: [20, 'Phone number too long'] // [H1]
  },
  webhookUrl: {
    type: String,
    default: '',
    maxlength: [500, 'Webhook URL too long'], // [H1]
    validate: {
      validator: v => !v || /^https:\/\/.+/.test(v),
      message: 'Webhook URL must be a valid HTTPS URL'
    }
  },
  // Additional contact emails that should receive alerts (optional)
  contactEmails: {
    type: [String],
    default: [],
    validate: [
      {
        validator: arr => arr.length <= 10, // [M5] Cap at 10 to prevent email-flood DoS
        message: 'Maximum 10 contact emails allowed'
      },
      {
        validator: arr => arr.every(email => /^\S+@\S+\.\S+$/.test(email)),
        message: 'One or more contact emails are invalid'
      }
    ]
  },
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  },
  passwordChangedAt: {
    type: Date,
    select: false
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function (doc, ret) {
      delete ret.password;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      delete ret.passwordChangedAt;
      // Note: slackWebhook, phoneNumber, webhookUrl, contactEmails intentionally NOT deleted - needed for Settings UI
      return ret;
    }
  },
  toObject: {
    transform: function (doc, ret) {
      delete ret.password;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      delete ret.passwordChangedAt;
      // Note: slackWebhook, phoneNumber, webhookUrl, contactEmails intentionally NOT deleted - needed for Settings UI
      return ret;
    }
  }
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  // If password modified (and not new), set passwordChangedAt - 1s (to account for delay)
  if (!this.isNew) {
    this.passwordChangedAt = Date.now() - 1000;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Shared user cascading cleanup helper
async function cleanupUserDependencies(userId, userEmail) {
  try {
    const Monitor = mongoose.model('Monitor');
    const Incident = mongoose.model('Incident');
    const Check = mongoose.model('Check');
    const User = mongoose.model('User');
    const schedulerService = (await import('../services/scheduler.service.js')).default;
    const healthStateService = (await import('../services/health-evaluator.service.js')).default;
    const enhancedAlertService = (await import('../services/enhanced-alert.service.js')).default;
    const redisClient = (await import('../config/redis-cache.js')).default;

    console.log(`🗑️  Cascading delete for user: ${userId}`);

    // Find all monitors belonging to this user
    const monitors = await Monitor.find({ user: userId });
    const monitorIds = monitors.map(m => m._id);

    console.log(`   Found ${monitors.length} monitors to delete for user ${userId}`);

    // Delete all related data across Database, Scheduler, and Redis
    await Promise.all([
      // 1. Remove from BullMQ scheduler
      ...monitorIds.map(id => schedulerService.removeMonitor(id).catch(err =>
        console.error(`   Scheduler remove failed for ${id}:`, err.message)
      )),
      // 2. Clean up health state in Redis
      ...monitorIds.map(id => healthStateService.cleanupState(id).catch(err =>
        console.error(`   HealthState cleanup failed for ${id}:`, err.message)
      )),
      // 3. Clear alert suppression in Redis
      ...monitorIds.map(id => enhancedAlertService.clearAlertSuppression(id).catch(err =>
        console.error(`   Alert suppression clear failed for ${id}:`, err.message)
      )),
      // 4. Clean up cooldown keys in Redis
      ...monitorIds.map(id => redisClient.del(`cooldown:manual-check:${id}`).catch(() => {})),
      // 5. Clean up admin stats cache for this user
      redisClient.del(`admin:stats:${userId}`).catch(() => {}),
      // 6. Delete all incidents associated with user's monitors
      Incident.deleteMany({ monitor: { $in: monitorIds } }),
      // 7. Delete all checks associated with user's monitors
      Check.deleteMany({ monitor: { $in: monitorIds } }),
      // 8. Delete all monitors belonging to this user
      Monitor.deleteMany({ user: userId }),
      // 9. Remove this user's email from any other user's contactEmails
      userEmail ? User.updateMany(
        { contactEmails: userEmail.toLowerCase() },
        { $pull: { contactEmails: userEmail.toLowerCase() } }
      ) : Promise.resolve()
    ]);

    // Mirror ALL cascading deletes to secondary DB (Dual-Write)
    // This ensures Local MongoDB (Compass) and Atlas Cloud both stay in sync after user deletion
    const dbMirrorMod = (await import('../services/db-mirror.service.js')).default;
    if (monitorIds.length > 0) {
      dbMirrorMod.mirrorDeleteMany('checks', { monitor: { $in: monitorIds } });
      dbMirrorMod.mirrorDeleteMany('incidents', { monitor: { $in: monitorIds } });
      dbMirrorMod.mirrorDeleteMany('monitors', { user: userId });
    }

    console.log(`   ✅ Cascading delete complete for user ${userId}: all monitors, checks, incidents, Redis keys, and references deleted`);
  } catch (error) {
    console.error('❌ User cascading delete error:', error);
  }
}

// Cascading delete hooks
userSchema.pre('deleteOne', { document: true, query: false }, async function () {
  await cleanupUserDependencies(this._id, this.email);
});

userSchema.post('findOneAndDelete', async function (doc) {
  if (doc) {
    await cleanupUserDependencies(doc._id, doc.email);
  }
});

// Check if password changed after token issued
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  // False means NOT changed
  return false;
};

userSchema.index({ role: 1, createdAt: -1 });

// Dual-Write Mirroring hooks
import dbMirror from '../services/db-mirror.service.js';

userSchema.post('save', function (doc) {
  if (doc) dbMirror.mirrorSave('users', doc);
});

userSchema.post('findOneAndUpdate', function (doc) {
  if (doc) dbMirror.mirrorSave('users', doc);
});

userSchema.post('findOneAndDelete', function (doc) {
  if (doc) dbMirror.mirrorDelete('users', doc._id);
});

userSchema.post('deleteOne', { document: true, query: false }, function (doc) {
  if (doc) dbMirror.mirrorDelete('users', doc._id);
});

export default mongoose.model('User', userSchema);
