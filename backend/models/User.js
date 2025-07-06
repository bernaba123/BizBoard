import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Password not required for Google OAuth users
    },
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  businessName: {
    type: String,
    required: [true, 'Business name is required'],
    trim: true,
    maxlength: [100, 'Business name cannot exceed 100 characters']
  },
  businessType: {
    type: String,
    required: [true, 'Business type is required'],
    enum: ['electrician', 'plumber', 'cleaner', 'tutor', 'handyman', 'other']
  },
  phone: {
    type: String,
    trim: true,
    maxlength: [20, 'Phone number cannot exceed 20 characters']
  },
  address: {
    type: String,
    trim: true,
    maxlength: [200, 'Address cannot exceed 200 characters']
  },
  
  // Google OAuth Support
  googleId: {
    type: String,
    sparse: true // Allow null values but ensure uniqueness when present
  },
  profilePicture: {
    type: String // URL from Google or uploaded
  },
  
  // Multilingual Support
  language: {
    type: String,
    enum: ['en', 'am', 'or'], // English, Amharic, Afan Oromo
    default: 'en'
  },
  
  // Business Hours for Smart Booking
  businessHours: {
    monday: { start: String, end: String, isOpen: { type: Boolean, default: true } },
    tuesday: { start: String, end: String, isOpen: { type: Boolean, default: true } },
    wednesday: { start: String, end: String, isOpen: { type: Boolean, default: true } },
    thursday: { start: String, end: String, isOpen: { type: Boolean, default: true } },
    friday: { start: String, end: String, isOpen: { type: Boolean, default: true } },
    saturday: { start: String, end: String, isOpen: { type: Boolean, default: true } },
    sunday: { start: String, end: String, isOpen: { type: Boolean, default: false } }
  },
  timezone: {
    type: String,
    default: 'Africa/Addis_Ababa'
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

export default mongoose.model('User', userSchema);