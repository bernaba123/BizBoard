import express from 'express';
import Booking from '../models/Booking.js';
import Customer from '../models/Customer.js';
import Payment from '../models/Payment.js';
import Service from '../models/Service.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Get dashboard analytics
router.get('/dashboard', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Total counts
    const totalBookings = await Booking.countDocuments({ userId });
    const totalCustomers = await Customer.countDocuments({ userId });
    const totalServices = await Service.countDocuments({ userId, isActive: true });

    // This month stats
    const thisMonthBookings = await Booking.countDocuments({
      userId,
      createdAt: { $gte: startOfMonth }
    });

    const thisMonthRevenue = await Payment.aggregate([
      {
        $match: {
          userId: userId,
          status: 'completed',
          createdAt: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Recent bookings with localized status
    const recentBookings = await Booking.find({ userId })
      .populate('customerId', 'name')
      .populate('serviceId', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    // Translate booking statuses for recent bookings
    const localizedRecentBookings = recentBookings.map(booking => ({
      ...booking.toObject(),
      localizedStatus: req.translateStatus(booking.status),
      originalStatus: booking.status
    }));

    // Booking status distribution with localized labels
    const bookingStatusStats = await Booking.aggregate([
      { $match: { userId: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Add localized status labels
    const localizedBookingStats = bookingStatusStats.map(stat => ({
      _id: stat._id,
      count: stat.count,
      localizedLabel: req.translateStatus(stat._id),
      originalStatus: stat._id
    }));

    // Monthly revenue trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyRevenue = await Payment.aggregate([
      {
        $match: {
          userId: userId,
          status: 'completed',
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    // Top services
    const topServices = await Booking.aggregate([
      { $match: { userId: userId } },
      {
        $group: {
          _id: '$serviceId',
          bookings: { $sum: 1 },
          revenue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { bookings: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'services',
          localField: '_id',
          foreignField: '_id',
          as: 'service'
        }
      },
      { $unwind: '$service' }
    ]);

    res.json({
      success: true,
      analytics: {
        overview: {
          totalBookings,
          totalCustomers,
          totalServices,
          thisMonthBookings,
          thisMonthRevenue: thisMonthRevenue[0]?.total || 0
        },
        recentBookings: localizedRecentBookings,
        bookingStatusStats: localizedBookingStats,
        monthlyRevenue,
        topServices
      },
      language: req.language // Include current language in response
    });
  } catch (error) {
    res.status(400).json({ 
      message: req.t('messages.error.general') || error.message,
      originalError: error.message
    });
  }
});

export default router;