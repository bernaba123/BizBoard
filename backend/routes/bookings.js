import express from 'express';
import Booking from '../models/Booking.js';
import Customer from '../models/Customer.js';
import Service from '../models/Service.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Get all bookings for authenticated user with calendar view support
router.get('/', auth, async (req, res) => {
  try {
    const { status, date, startDate, endDate, view = 'list', page = 1, limit = 10 } = req.query;
    
    const query = { userId: req.user.userId };
    
    // Filter by status
    if (status) query.status = status;
    
    // Filter by date range for calendar view
    if (startDate && endDate) {
      query.startDateTime = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.startDateTime = { $gte: startOfDay, $lte: endOfDay };
    }

    let bookings;
    let total;

    if (view === 'calendar') {
      // For calendar view, get all bookings without pagination
      bookings = await Booking.find(query)
        .populate('customerId', 'name email phone')
        .populate('serviceId', 'name price duration')
        .sort({ startDateTime: 1 });
      total = bookings.length;
    } else {
      // For list view, use pagination
      bookings = await Booking.find(query)
        .populate('customerId', 'name email phone')
        .populate('serviceId', 'name price duration')
        .sort({ startDateTime: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
      total = await Booking.countDocuments(query);
    }

    res.json({
      success: true,
      count: bookings.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      bookings
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get available time slots for a specific date
router.get('/available-slots/:date', auth, async (req, res) => {
  try {
    const { date } = req.params;
    const { duration = 60 } = req.query;
    
    const requestedDate = new Date(date);
    const availableSlots = await Booking.getAvailableTimeSlots(
      req.user.userId, 
      requestedDate, 
      parseInt(duration)
    );

    res.json({
      success: true,
      date: requestedDate,
      availableSlots
    });
  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Check for conflicts when creating/updating a booking
router.post('/check-conflicts', auth, async (req, res) => {
  try {
    const { date, time, duration, excludeBookingId } = req.body;
    
    // Create a temporary booking object to check conflicts
    const tempBooking = new Booking({
      userId: req.user.userId,
      date: new Date(date),
      time,
      duration: parseInt(duration),
      customerId: '507f1f77bcf86cd799439011', // Dummy ID for validation
      serviceId: '507f1f77bcf86cd799439011'
    });

    // Exclude specific booking if updating
    if (excludeBookingId) {
      tempBooking._id = excludeBookingId;
    }

    const conflicts = await tempBooking.checkConflicts();

    res.json({
      success: true,
      hasConflicts: conflicts.length > 0,
      conflicts: conflicts.map(booking => ({
        id: booking._id,
        startDateTime: booking.startDateTime,
        endDateTime: booking.endDateTime,
        customerName: booking.customerId?.name || 'Unknown',
        serviceName: booking.serviceId?.name || 'Unknown'
      }))
    });
  } catch (error) {
    console.error('Check conflicts error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get single booking
router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    })
      .populate('customerId', 'name email phone address')
      .populate('serviceId', 'name description price duration');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Create new booking with conflict detection
router.post('/', auth, async (req, res) => {
  try {
    const { customerId, serviceId, date, time, notes } = req.body;
    
    // Verify customer and service belong to user
    const customer = await Customer.findOne({ 
      _id: customerId, 
      userId: req.user.userId 
    });
    const service = await Service.findOne({ 
      _id: serviceId, 
      userId: req.user.userId 
    });
    
    if (!customer || !service) {
      return res.status(404).json({ 
        message: 'Customer or Service not found' 
      });
    }

    // Create new booking
    const booking = new Booking({
      userId: req.user.userId,
      customerId,
      serviceId,
      date: new Date(date),
      time,
      duration: service.duration,
      totalAmount: service.price,
      notes
    });

    // Check for conflicts before saving
    const conflicts = await booking.checkConflicts();
    if (conflicts.length > 0) {
      return res.status(400).json({ 
        message: 'Time slot conflicts with existing booking',
        conflicts: conflicts.map(conflict => ({
          id: conflict._id,
          startDateTime: conflict.startDateTime,
          endDateTime: conflict.endDateTime
        }))
      });
    }

    await booking.save();

    // Update customer stats
    await Customer.findByIdAndUpdate(customerId, {
      $inc: { totalBookings: 1 },
      lastBooking: new Date()
    });

    const populatedBooking = await Booking.findById(booking._id)
      .populate('customerId', 'name email phone')
      .populate('serviceId', 'name price duration');

    res.status(201).json({
      success: true,
      message: req.t('messages.success.bookingCreated'),
      booking: populatedBooking
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update booking with conflict detection
router.put('/:id', auth, async (req, res) => {
  try {
    const { date, time, status, notes, paymentStatus, paymentMethod } = req.body;

    const booking = await Booking.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // If updating time/date, check for conflicts
    if (date || time) {
      booking.date = date ? new Date(date) : booking.date;
      booking.time = time || booking.time;
      
      const conflicts = await booking.checkConflicts();
      if (conflicts.length > 0) {
        return res.status(400).json({ 
          message: 'Updated time conflicts with existing booking',
          conflicts: conflicts.map(conflict => ({
            id: conflict._id,
            startDateTime: conflict.startDateTime,
            endDateTime: conflict.endDateTime
          }))
        });
      }
    }

    // Update other fields
    if (status) booking.status = status;
    if (notes !== undefined) booking.notes = notes;
    if (paymentStatus) booking.paymentStatus = paymentStatus;
    if (paymentMethod) booking.paymentMethod = paymentMethod;

    await booking.save();

    const updatedBooking = await Booking.findById(booking._id)
      .populate('customerId', 'name email phone')
      .populate('serviceId', 'name price duration');

    res.json({
      success: true,
      message: req.t('messages.success.bookingUpdated'),
      booking: updatedBooking
    });
  } catch (error) {
    console.error('Update booking error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Reschedule booking (for drag & drop calendar)
router.put('/:id/reschedule', auth, async (req, res) => {
  try {
    const { newStartDateTime, reason = 'Rescheduled via calendar' } = req.body;

    const booking = await Booking.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Use the reschedule method from the model
    const rescheduledBooking = await booking.reschedule(
      new Date(newStartDateTime), 
      reason, 
      'user'
    );

    const populatedBooking = await Booking.findById(rescheduledBooking._id)
      .populate('customerId', 'name email phone')
      .populate('serviceId', 'name price duration');

    res.json({
      success: true,
      message: 'Booking rescheduled successfully',
      booking: populatedBooking,
      originalTime: rescheduledBooking.originalStartDateTime,
      newTime: rescheduledBooking.startDateTime
    });
  } catch (error) {
    console.error('Reschedule booking error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get calendar view data (optimized for calendar display)
router.get('/calendar/view', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        message: 'Start date and end date are required' 
      });
    }

    const bookings = await Booking.find({
      userId: req.user.userId,
      startDateTime: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      },
      status: { $nin: ['cancelled'] }
    })
    .populate('customerId', 'name email phone')
    .populate('serviceId', 'name price duration')
    .sort({ startDateTime: 1 });

    // Format for calendar display
    const calendarEvents = bookings.map(booking => ({
      id: booking._id,
      title: `${booking.customerId?.name || 'Unknown'} - ${booking.serviceId?.name || 'Service'}`,
      start: booking.startDateTime,
      end: booking.endDateTime,
      backgroundColor: booking.calendarColor,
      borderColor: booking.calendarColor,
      textColor: '#ffffff',
      allDay: booking.isAllDay,
      extendedProps: {
        customerId: booking.customerId?._id,
        customerName: booking.customerId?.name,
        customerPhone: booking.customerId?.phone,
        serviceId: booking.serviceId?._id,
        serviceName: booking.serviceId?.name,
        status: booking.status,
        totalAmount: booking.totalAmount,
        paymentStatus: booking.paymentStatus,
        notes: booking.notes,
        hasConflicts: booking.hasConflicts
      }
    }));

    res.json({
      success: true,
      events: calendarEvents,
      count: calendarEvents.length
    });
  } catch (error) {
    console.error('Get calendar view error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete booking
router.delete('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findOneAndDelete({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    
    res.json({
      success: true,
      message: 'Booking deleted successfully'
    });
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(400).json({ message: error.message });
  }
});

export default router;