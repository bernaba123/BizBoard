import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  date: {
    type: Date,
    required: [true, 'Booking date is required']
  },
  time: {
    type: String,
    required: [true, 'Booking time is required'],
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please enter valid time format (HH:MM)']
  },
  duration: {
    type: Number,
    required: [true, 'Booking duration is required'],
    min: [15, 'Duration must be at least 15 minutes']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Amount must be positive']
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'overdue', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'bank_transfer', 'other'],
    default: 'cash'
  },
  
  // Smart Calendar Features
  startDateTime: {
    type: Date,
    required: true
  },
  endDateTime: {
    type: Date,
    required: true
  },
  timezone: {
    type: String,
    default: 'Africa/Addis_Ababa'
  },
  
  // Conflict Detection
  hasConflicts: {
    type: Boolean,
    default: false
  },
  conflictsWith: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  }],
  
  // Drag & Drop / Rescheduling Support
  originalStartDateTime: Date,
  originalEndDateTime: Date,
  rescheduledAt: Date,
  rescheduledBy: {
    type: String,
    enum: ['user', 'customer', 'system']
  },
  rescheduleReason: String,
  
  // Calendar Display Properties
  calendarColor: {
    type: String,
    default: '#3b82f6' // Blue
  },
  isAllDay: {
    type: Boolean,
    default: false
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringRule: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly']
    },
    interval: Number,
    endDate: Date
  }
}, {
  timestamps: true
});

// Index for better query performance
bookingSchema.index({ userId: 1, date: 1 });
bookingSchema.index({ customerId: 1 });
bookingSchema.index({ serviceId: 1 });
bookingSchema.index({ startDateTime: 1, endDateTime: 1 });
bookingSchema.index({ userId: 1, startDateTime: 1 });

// Pre-save middleware to set start/end DateTime and check conflicts
bookingSchema.pre('save', async function(next) {
  // Convert date and time to DateTime objects
  if (this.isModified('date') || this.isModified('time') || this.isModified('duration')) {
    const [hours, minutes] = this.time.split(':').map(Number);
    this.startDateTime = new Date(this.date);
    this.startDateTime.setHours(hours, minutes, 0, 0);
    
    this.endDateTime = new Date(this.startDateTime);
    this.endDateTime.setMinutes(this.endDateTime.getMinutes() + this.duration);
  }
  
  // Check for conflicts if this is a new booking or time has changed
  if (this.isNew || this.isModified('startDateTime') || this.isModified('endDateTime')) {
    const conflicts = await this.checkConflicts();
    this.hasConflicts = conflicts.length > 0;
    this.conflictsWith = conflicts.map(booking => booking._id);
  }
  
  next();
});

// Method to check for time conflicts
bookingSchema.methods.checkConflicts = async function() {
  const query = {
    userId: this.userId,
    _id: { $ne: this._id }, // Exclude current booking
    status: { $in: ['pending', 'confirmed', 'in-progress'] },
    $or: [
      // New booking starts during existing booking
      {
        startDateTime: { $lte: this.startDateTime },
        endDateTime: { $gt: this.startDateTime }
      },
      // New booking ends during existing booking
      {
        startDateTime: { $lt: this.endDateTime },
        endDateTime: { $gte: this.endDateTime }
      },
      // New booking completely contains existing booking
      {
        startDateTime: { $gte: this.startDateTime },
        endDateTime: { $lte: this.endDateTime }
      },
      // Existing booking completely contains new booking
      {
        startDateTime: { $lte: this.startDateTime },
        endDateTime: { $gte: this.endDateTime }
      }
    ]
  };
  
  return await this.constructor.find(query);
};

// Method to get available time slots for a date
bookingSchema.statics.getAvailableTimeSlots = async function(userId, date, duration = 60) {
  const user = await mongoose.model('User').findById(userId);
  if (!user || !user.businessHours) return [];
  
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
  const dayHours = user.businessHours[dayOfWeek];
  
  if (!dayHours || !dayHours.isOpen) return [];
  
  // Get existing bookings for the date
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const existingBookings = await this.find({
    userId,
    startDateTime: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['pending', 'confirmed', 'in-progress'] }
  }).sort({ startDateTime: 1 });
  
  // Generate available slots
  const availableSlots = [];
  const [startHour, startMinute] = dayHours.start.split(':').map(Number);
  const [endHour, endMinute] = dayHours.end.split(':').map(Number);
  
  let currentTime = new Date(date);
  currentTime.setHours(startHour, startMinute, 0, 0);
  
  const businessEndTime = new Date(date);
  businessEndTime.setHours(endHour, endMinute, 0, 0);
  
  while (currentTime < businessEndTime) {
    const slotEndTime = new Date(currentTime.getTime() + duration * 60000);
    
    // Check if this slot conflicts with any existing booking
    const hasConflict = existingBookings.some(booking => {
      return (currentTime < booking.endDateTime && slotEndTime > booking.startDateTime);
    });
    
    if (!hasConflict && slotEndTime <= businessEndTime) {
      availableSlots.push({
        startTime: new Date(currentTime),
        endTime: new Date(slotEndTime),
        timeString: currentTime.toTimeString().slice(0, 5)
      });
    }
    
    // Move to next 30-minute slot
    currentTime.setMinutes(currentTime.getMinutes() + 30);
  }
  
  return availableSlots;
};

// Method to reschedule booking (for drag & drop)
bookingSchema.methods.reschedule = async function(newStartDateTime, reason = 'Rescheduled via calendar', rescheduledBy = 'user') {
  // Store original times
  this.originalStartDateTime = this.startDateTime;
  this.originalEndDateTime = this.endDateTime;
  
  // Calculate new end time based on duration
  const newEndDateTime = new Date(newStartDateTime.getTime() + this.duration * 60000);
  
  // Update times
  this.startDateTime = newStartDateTime;
  this.endDateTime = newEndDateTime;
  
  // Extract date and time
  this.date = new Date(newStartDateTime);
  this.date.setHours(0, 0, 0, 0);
  this.time = newStartDateTime.toTimeString().slice(0, 5);
  
  // Set reschedule metadata
  this.rescheduledAt = new Date();
  this.rescheduledBy = rescheduledBy;
  this.rescheduleReason = reason;
  
  return await this.save();
};

// Virtual for getting booking duration in hours
bookingSchema.virtual('durationHours').get(function() {
  return this.duration / 60;
});

// Virtual for checking if booking is today
bookingSchema.virtual('isToday').get(function() {
  const today = new Date();
  const bookingDate = new Date(this.date);
  return today.toDateString() === bookingDate.toDateString();
});

export default mongoose.model('Booking', bookingSchema);