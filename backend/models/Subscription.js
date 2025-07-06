import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  plan: {
    type: String,
    enum: ['free', 'pro', 'business'],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'expired', 'trial', 'past_due', 'paused'],
    default: 'trial'
  },
  stripeCustomerId: {
    type: String,
    required: function() { return this.plan !== 'free'; }
  },
  stripeSubscriptionId: {
    type: String,
    required: function() { return this.plan !== 'free' && this.status !== 'trial'; }
  },
  currentPeriodStart: {
    type: Date,
    default: Date.now
  },
  currentPeriodEnd: {
    type: Date,
    required: true
  },
  trialEnd: Date,
  cancelledAt: Date,
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false
  },
  // Pricing information
  pricing: {
    amount: {
      type: Number,
      required: function() { return this.plan !== 'free'; }
    },
    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'ETB'] // US Dollar, Ethiopian Birr
    },
    interval: {
      type: String,
      enum: ['month', 'year'],
      default: 'month'
    }
  },
  // Usage tracking
  usage: {
    bookingsThisMonth: {
      type: Number,
      default: 0
    },
    servicesCount: {
      type: Number,
      default: 0
    },
    assistantsCount: {
      type: Number,
      default: 0
    },
    lastReset: {
      type: Date,
      default: Date.now
    }
  },
  // Plan limits
  limits: {
    maxBookingsPerMonth: {
      type: Number,
      default: function() {
        switch(this.plan) {
          case 'free': return 50;
          case 'pro': return 500;
          case 'business': return -1; // unlimited
          default: return 50;
        }
      }
    },
    maxServices: {
      type: Number,
      default: function() {
        switch(this.plan) {
          case 'free': return 5;
          case 'pro': return 50;
          case 'business': return -1; // unlimited
          default: return 5;
        }
      }
    },
    maxAssistants: {
      type: Number,
      default: function() {
        switch(this.plan) {
          case 'free': return 0;
          case 'pro': return 3;
          case 'business': return -1; // unlimited
          default: return 0;
        }
      }
    },
    features: {
      type: [String],
      default: function() {
        switch(this.plan) {
          case 'free': return ['basic_booking', 'customer_management'];
          case 'pro': return ['basic_booking', 'customer_management', 'ai_recommendations', 'reminders', 'basic_analytics'];
          case 'business': return ['basic_booking', 'customer_management', 'ai_recommendations', 'reminders', 'advanced_analytics', 'rbac', 'white_label', 'api_access'];
          default: return ['basic_booking'];
        }
      }
    }
  },
  // Billing history reference
  invoices: [{
    stripeInvoiceId: String,
    amount: Number,
    currency: String,
    status: {
      type: String,
      enum: ['paid', 'open', 'void', 'uncollectible']
    },
    paidAt: Date,
    dueDate: Date,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Webhook events
  webhookEvents: [{
    eventType: String,
    stripeEventId: String,
    processed: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Discount and coupon codes
  discount: {
    couponCode: String,
    percentOff: Number,
    amountOff: Number,
    validUntil: Date
  }
}, {
  timestamps: true
});

// Indexes
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ stripeCustomerId: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

// Virtual for days remaining in trial/subscription
subscriptionSchema.virtual('daysRemaining').get(function() {
  const endDate = this.trialEnd || this.currentPeriodEnd;
  const now = new Date();
  const diffTime = endDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Method to check if feature is available
subscriptionSchema.methods.hasFeature = function(feature) {
  return this.limits.features.includes(feature);
};

// Method to check usage limits
subscriptionSchema.methods.canCreateBooking = function() {
  if (this.limits.maxBookingsPerMonth === -1) return true;
  return this.usage.bookingsThisMonth < this.limits.maxBookingsPerMonth;
};

subscriptionSchema.methods.canCreateService = function() {
  if (this.limits.maxServices === -1) return true;
  return this.usage.servicesCount < this.limits.maxServices;
};

subscriptionSchema.methods.canCreateAssistant = function() {
  if (this.limits.maxAssistants === -1) return true;
  return this.usage.assistantsCount < this.limits.maxAssistants;
};

// Method to reset monthly usage
subscriptionSchema.methods.resetMonthlyUsage = function() {
  const now = new Date();
  const lastReset = new Date(this.usage.lastReset);
  
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    this.usage.bookingsThisMonth = 0;
    this.usage.lastReset = now;
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Static method to get plan pricing
subscriptionSchema.statics.getPlanPricing = function(plan, currency = 'USD') {
  const pricing = {
    USD: {
      pro: { monthly: 29, yearly: 290 },
      business: { monthly: 99, yearly: 990 }
    },
    ETB: {
      pro: { monthly: 1500, yearly: 15000 },
      business: { monthly: 5000, yearly: 50000 }
    }
  };
  
  return pricing[currency]?.[plan] || null;
};

// Pre-save middleware to set limits based on plan
subscriptionSchema.pre('save', function(next) {
  if (this.isModified('plan')) {
    switch(this.plan) {
      case 'free':
        this.limits.maxBookingsPerMonth = 50;
        this.limits.maxServices = 5;
        this.limits.maxAssistants = 0;
        this.limits.features = ['basic_booking', 'customer_management'];
        break;
      case 'pro':
        this.limits.maxBookingsPerMonth = 500;
        this.limits.maxServices = 50;
        this.limits.maxAssistants = 3;
        this.limits.features = ['basic_booking', 'customer_management', 'ai_recommendations', 'reminders', 'basic_analytics'];
        break;
      case 'business':
        this.limits.maxBookingsPerMonth = -1;
        this.limits.maxServices = -1;
        this.limits.maxAssistants = -1;
        this.limits.features = ['basic_booking', 'customer_management', 'ai_recommendations', 'reminders', 'advanced_analytics', 'rbac', 'white_label', 'api_access'];
        break;
    }
  }
  next();
});

export default mongoose.model('Subscription', subscriptionSchema);