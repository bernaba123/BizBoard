import express from 'express';
import Payment from '../models/Payment.js';
import Booking from '../models/Booking.js';
import Customer from '../models/Customer.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Get all payments for authenticated user
router.get('/', protect, async (req, res) => {
  try {
    const { status, method, page = 1, limit = 10 } = req.query;
    
    const query = { userId: req.user.id };
    if (status) query.status = status;
    if (method) query.method = method;

    const payments = await Payment.find(query)
      .populate('bookingId', 'date time')
      .populate('customerId', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      count: payments.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      payments
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Create new payment
router.post('/', protect, async (req, res) => {
  try {
    const { bookingId, amount, method, transactionId, notes } = req.body;
    
    // Verify booking belongs to user
    const booking = await Booking.findOne({ _id: bookingId, userId: req.user.id });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const payment = await Payment.create({
      userId: req.user.id,
      bookingId,
      customerId: booking.customerId,
      amount,
      method,
      transactionId,
      notes,
      status: 'completed',
      paidAt: new Date()
    });

    // Update booking payment status
    await Booking.findByIdAndUpdate(bookingId, {
      paymentStatus: 'paid',
      paymentMethod: method
    });

    // Update customer total spent
    await Customer.findByIdAndUpdate(booking.customerId, {
      $inc: { totalSpent: amount }
    });

    const populatedPayment = await Payment.findById(payment._id)
      .populate('bookingId', 'date time')
      .populate('customerId', 'name email');

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      payment: populatedPayment
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update payment
router.put('/:id', protect, async (req, res) => {
  try {
    const { status, method, transactionId, notes } = req.body;

    const payment = await Payment.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { status, method, transactionId, notes },
      { new: true, runValidators: true }
    ).populate('bookingId', 'date time')
     .populate('customerId', 'name email');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.json({
      success: true,
      message: 'Payment updated successfully',
      payment
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;