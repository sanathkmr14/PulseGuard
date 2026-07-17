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
      delete ret.slackWebhook;
      delete ret.phoneNumber;
      delete ret.webhookUrl;
      // Note: contactEmails intentionally NOT deleted - needed for Settings UI
      return ret;
    }
  },
  toObject: {
    transform: function (doc, ret) {
      delete ret.password;
      delete ret.slackWebhook;
      delete ret.phoneNumber;
      delete ret.webhookUrl;
      // Note: contactEmails intentionally NOT deleted - needed for Settings UI
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

// Cascading delete middleware - FIXED: Ensure all deletes complete before user deletion
userSchema.pre('deleteOne', { document: true, query: false }, async function () {
  try {
    const Monitor = mongoose.model('Monitor');
    const Incident = mongoose.model('Incident');
    const Check = mongoose.model('Check');
    const schedulerService = (await import('../services/scheduler.service.js')).default;

    console.log(`🗑️  Cascading delete for user: ${this._id}`);

    // Find all monitors belonging to this user
    const monitors = await Monitor.find({ user: this._id });
    const monitorIds = monitors.map(m => m._id);

    console.log(`   Found ${monitors.length} monitors to delete`);

    // Delete all related data FIRST (wait for all to complete)
    await Promise.all([
      // Remove from scheduler
      ...monitorIds.map(id => schedulerService.removeMonitor(id).catch(err =>
        console.error(`   Scheduler remove failed for ${id}:`, err.message)
      )),
      // Delete all incidents associated with user's monitors
      Incident.deleteMany({ monitor: { $in: monitorIds } }),
      // Delete all checks associated with user's monitors
      Check.deleteMany({ monitor: { $in: monitorIds } }),
      // Delete all monitors belonging to this user
      Monitor.deleteMany({ user: this._id })
    ]);

    console.log(`   ✅ Deleted ${monitorIds.length} monitors, their checks and incidents`);
  } catch (error) {
    console.error('❌ Cascading delete error:', error);
    // Don't throw - let the user deletion proceed
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

export default mongoose.model('User', userSchema);
