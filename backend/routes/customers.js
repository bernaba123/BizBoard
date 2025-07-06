import express from 'express';
import Customer from '../models/Customer.js';
import Booking from '../models/Booking.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Get all customers for authenticated user
router.get('/', protect, async (req, res) => {
  try {
    const customers = await Customer.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({
      success: true,
      count: customers.length,
      customers,
      language: req.language
    });
  } catch (error) {
    res.status(400).json({ 
      message: req.t('messages.error.general') || error.message,
      originalError: error.message
    });
  }
});

// Get single customer with booking history
router.get('/:id', protect, async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user.id });
    if (!customer) {
      return res.status(404).json({ message: req.t('messages.error.notFound') });
    }

    const bookings = await Booking.find({ customerId: req.params.id })
      .populate('serviceId', 'name price')
      .sort({ createdAt: -1 });

    // Localize booking statuses
    const localizedBookings = bookings.map(booking => ({
      ...booking.toObject(),
      localizedStatus: req.translateStatus(booking.status),
      originalStatus: booking.status
    }));

    res.json({
      success: true,
      customer,
      bookings: localizedBookings,
      language: req.language
    });
  } catch (error) {
    res.status(400).json({ 
      message: req.t('messages.error.general') || error.message,
      originalError: error.message
    });
  }
});

// Create new customer
router.post('/', protect, async (req, res) => {
  try {
    const { name, email, phone, address, notes } = req.body;
    
    // Check if customer already exists
    const existingCustomer = await Customer.findOne({ 
      userId: req.user.id, 
      email: email.toLowerCase() 
    });
    
    if (existingCustomer) {
      return res.status(400).json({ 
        message: req.t('messages.error.customerExists') || 'Customer with this email already exists'
      });
    }

    const customer = await Customer.create({
      userId: req.user.id,
      name,
      email,
      phone,
      address,
      notes
    });

    res.status(201).json({
      success: true,
      message: req.t('messages.success.customerCreated'),
      customer
    });
  } catch (error) {
    res.status(400).json({ 
      message: req.t('messages.error.general') || error.message,
      originalError: error.message
    });
  }
});

// Update customer
router.put('/:id', protect, async (req, res) => {
  try {
    const { name, email, phone, address, notes } = req.body;

    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { name, email, phone, address, notes },
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({ message: req.t('messages.error.notFound') });
    }

    res.json({
      success: true,
      message: req.t('messages.success.updated'),
      customer
    });
  } catch (error) {
    res.status(400).json({ 
      message: req.t('messages.error.general') || error.message,
      originalError: error.message
    });
  }
});

// Delete customer
router.delete('/:id', protect, async (req, res) => {
  try {
    const customer = await Customer.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!customer) {
      return res.status(404).json({ message: req.t('messages.error.notFound') });
    }
    res.json({
      success: true,
      message: req.t('messages.success.deleted')
    });
  } catch (error) {
    res.status(400).json({ 
      message: req.t('messages.error.general') || error.message,
      originalError: error.message
    });
  }
});

export default router;