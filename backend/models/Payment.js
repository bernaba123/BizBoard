import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  // Basic Relations
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  subscription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  },
  
  // Payment Type
  type: {
    type: String,
    enum: ['booking', 'subscription', 'one_time', 'refund', 'partial_refund'],
    required: true
  },
  
  // Amount Details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'ETB',
    uppercase: true
  },
  originalAmount: Number, // For partial payments/refunds
  
  // Stripe Integration
  stripePaymentIntentId: {
    type: String,
    unique: true,
    sparse: true
  },
  stripeChargeId: String,
  stripeInvoiceId: String,
  stripeCustomerId: String,
  
  // Alternative Payment Providers (Telebirr, etc.)
  telebirrTransactionId: String,
  mobileMoneyReference: String,
  bankTransferReference: String,
  
  // Payment Method
  method: {
    type: String,
    enum: [
      'cash', 
      'stripe_card', 
      'stripe_bank', 
      'telebirr', 
      'mobile_money', 
      'bank_transfer', 
      'wallet',
      'other'
    ],
    required: true
  },
  
  // Card/Payment Method Details (for saved payment methods)
  paymentMethodDetails: {
    type: {
      type: String,
      enum: ['card', 'bank_account', 'mobile_wallet']
    },
    last4: String,
    brand: String, // visa, mastercard, etc.
    expiryMonth: Number,
    expiryYear: Number,
    fingerprint: String
  },
  
  // Status & Processing
  status: {
    type: String,
    enum: [
      'pending',
      'processing', 
      'succeeded',
      'failed',
      'cancelled',
      'refunded',
      'partially_refunded',
      'disputed'
    ],
    default: 'pending'
  },
  
  // Dates & Timeline
  processedAt: Date,
  refundedAt: Date,
  failedAt: Date,
  
  // Fees & Taxes
  fees: {
    stripe: { type: Number, default: 0 },
    platform: { type: Number, default: 0 },
    processing: { type: Number, default: 0 }
  },
  taxes: {
    vat: { type: Number, default: 0 },
    service: { type: Number, default: 0 }
  },
  netAmount: Number, // Amount after fees and taxes
  
  // Refund Information
  refunds: [{
    amount: Number,
    reason: String,
    stripeRefundId: String,
    processedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed']
    }
  }],
  
  // Error Handling
  errorDetails: {
    code: String,
    message: String,
    type: String,
    decline_code: String,
    network_status: String
  },
  
  // Billing Information
  billingDetails: {
    name: String,
    email: String,
    phone: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postal_code: String,
      country: String
    }
  },
  
  // Receipt & Invoice
  receiptNumber: {
    type: String,
    unique: true
  },
  invoiceNumber: String,
  receiptUrl: String,
  
  // Metadata & Tracking
  description: String,
  metadata: mongoose.Schema.Types.Mixed,
  source: {
    type: String,
    enum: ['dashboard', 'public_booking', 'mobile_app', 'api'],
    default: 'dashboard'
  },
  
  // Recurring/Subscription Specific
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringCycle: {
    type: String,
    enum: ['monthly', 'yearly']
  },
  
  // Administrative
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String
}, {
  timestamps: true
});

// Indexes for performance and unique constraints
paymentSchema.index({ user: 1 });
paymentSchema.index({ customer: 1 });
paymentSchema.index({ booking: 1 });
paymentSchema.index({ subscription: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ method: 1 });
paymentSchema.index({ stripePaymentIntentId: 1 });
paymentSchema.index({ receiptNumber: 1 });
paymentSchema.index({ type: 1 });
paymentSchema.index({ user: 1, createdAt: -1 });

// Pre-save middleware to generate receipt number
paymentSchema.pre('save', function(next) {
  if (!this.receiptNumber && this.isNew) {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.receiptNumber = `RCP-${timestamp}-${random}`;
  }
  
  // Calculate net amount
  if (this.isModified('amount') || this.isModified('fees') || this.isModified('taxes')) {
    const totalFees = (this.fees?.stripe || 0) + (this.fees?.platform || 0) + (this.fees?.processing || 0);
    const totalTaxes = (this.taxes?.vat || 0) + (this.taxes?.service || 0);
    this.netAmount = this.amount - totalFees - totalTaxes;
  }
  
  next();
});

// Instance methods
paymentSchema.methods.canRefund = function() {
  return this.status === 'succeeded' && this.type !== 'refund';
};

paymentSchema.methods.getTotalRefunded = function() {
  return this.refunds.reduce((total, refund) => {
    return refund.status === 'succeeded' ? total + refund.amount : total;
  }, 0);
};

paymentSchema.methods.getRemainingRefundable = function() {
  return this.amount - this.getTotalRefunded();
};

// Static methods
paymentSchema.statics.getRevenueStats = function(userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        status: 'succeeded',
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        totalTransactions: { $sum: 1 },
        avgTransactionValue: { $avg: '$amount' },
        totalFees: { $sum: { $add: ['$fees.stripe', '$fees.platform', '$fees.processing'] } }
      }
    }
  ]);
};

export default mongoose.model('Payment', paymentSchema);