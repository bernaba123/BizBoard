import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Service name is required'],
    trim: true,
    maxlength: [100, 'Service name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Service description is required'],
    trim: true,
    maxlength: [500, 'Service description cannot exceed 500 characters']
  },
  price: {
    type: Number,
    required: [true, 'Service price is required'],
    min: [0, 'Price must be positive']
  },
  duration: {
    type: Number,
    required: [true, 'Service duration is required'],
    min: [15, 'Duration must be at least 15 minutes']
  },
  category: {
    type: String,
    required: [true, 'Service category is required'],
    enum: ['repair', 'maintenance', 'installation', 'cleaning', 'consultation', 'other']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better query performance
serviceSchema.index({ userId: 1, isActive: 1 });

export default mongoose.model('Service', serviceSchema);