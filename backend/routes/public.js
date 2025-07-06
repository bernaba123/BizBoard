import express from 'express';
import User from '../models/User.js';
import Service from '../models/Service.js';
import Customer from '../models/Customer.js';
import Booking from '../models/Booking.js';

const router = express.Router();

// Get business profile and services (public endpoint)
router.get('/business/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    
    const business = await User.findById(businessId).select('-password');
    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }

    const services = await Service.find({ 
      userId: businessId, 
      isActive: true 
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      business,
      services
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Create public booking
router.post('/bookings', async (req, res) => {
  try {
    const { businessId, serviceId, date, time, customerInfo } = req.body;

    // Verify business and service exist
    const business = await User.findById(businessId);
    const service = await Service.findOne({ _id: serviceId, userId: businessId });
    
    if (!business || !service) {
      return res.status(404).json({ message: 'Business or Service not found' });
    }

    // Check for booking conflicts
    const existingBooking = await Booking.findOne({
      userId: businessId,
      date: new Date(date),
      time,
      status: { $nin: ['cancelled', 'completed'] }
    });

    if (existingBooking) {
      return res.status(400).json({ message: 'Time slot already booked' });
    }

    // Find or create customer
    let customer = await Customer.findOne({ 
      userId: businessId, 
      email: customerInfo.email.toLowerCase() 
    });

    if (!customer) {
      customer = await Customer.create({
        userId: businessId,
        name: customerInfo.name,
        email: customerInfo.email,
        phone: customerInfo.phone,
        address: customerInfo.address,
        notes: customerInfo.notes
      });
    } else {
      // Update customer info if provided
      customer.name = customerInfo.name || customer.name;
      customer.phone = customerInfo.phone || customer.phone;
      customer.address = customerInfo.address || customer.address;
      if (customerInfo.notes) {
        customer.notes = customerInfo.notes;
      }
      await customer.save();
    }

    // Create booking
    const booking = await Booking.create({
      userId: businessId,
      customerId: customer._id,
      serviceId,
      date: new Date(date),
      time,
      duration: service.duration,
      totalAmount: service.price,
      notes: customerInfo.notes,
      status: 'pending'
    });

    // Update customer stats
    await Customer.findByIdAndUpdate(customer._id, {
      $inc: { totalBookings: 1 },
      lastBooking: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      booking: {
        id: booking._id,
        date: booking.date,
        time: booking.time,
        service: service.name,
        customer: customer.name
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get available time slots for a specific date
router.get('/availability/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    const bookings = await Booking.find({
      userId: businessId,
      date: new Date(date),
      status: { $nin: ['cancelled', 'completed'] }
    }).select('time');

    const bookedTimes = bookings.map(booking => booking.time);

    const allTimeSlots = [
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
      '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'
    ];

    const availableSlots = allTimeSlots.filter(slot => !bookedTimes.includes(slot));

    res.json({
      success: true,
      availableSlots,
      bookedSlots: bookedTimes
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;