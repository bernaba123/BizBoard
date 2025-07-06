import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { checkOwnerAccess, checkFeatureAccess } from '../middleware/rbac.js';
import aiService from '../services/aiService.js';
import User from '../models/User.js';
import Booking from '../models/Booking.js';

const router = express.Router();

// Get AI service status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const status = aiService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error fetching AI status:', error);
    res.status(500).json({ message: 'Failed to fetch AI status' });
  }
});

// Get booking recommendations
router.post('/recommendations/booking', 
  authenticateToken, 
  checkOwnerAccess,
  checkFeatureAccess('ai_recommendations'),
  async (req, res) => {
    try {
      const { customerId, serviceId, preferredDate, preferredTime } = req.body;

      if (!customerId || !serviceId || !preferredDate) {
        return res.status(400).json({ 
          message: 'Customer ID, service ID, and preferred date are required' 
        });
      }

      const recommendations = await aiService.getBookingRecommendations(
        req.effectiveUserId,
        customerId,
        serviceId,
        preferredDate,
        preferredTime
      );

      res.json(recommendations);
    } catch (error) {
      console.error('Error getting booking recommendations:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to get booking recommendations' 
      });
    }
  }
);

// Get smart scheduling suggestions
router.post('/scheduling/optimize',
  authenticateToken,
  checkOwnerAccess,
  checkFeatureAccess('ai_recommendations'),
  async (req, res) => {
    try {
      const { date, customerRequests } = req.body;

      if (!date || !customerRequests || !Array.isArray(customerRequests)) {
        return res.status(400).json({ 
          message: 'Date and customer requests array are required' 
        });
      }

      const suggestions = await aiService.getSmartSchedulingSuggestions(
        req.effectiveUserId,
        date,
        customerRequests
      );

      if (!suggestions) {
        return res.json({
          message: 'Smart scheduling is not available',
          suggestions: []
        });
      }

      res.json({ suggestions });
    } catch (error) {
      console.error('Error getting scheduling suggestions:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to get scheduling suggestions' 
      });
    }
  }
);

// Get AI preferences for user
router.get('/preferences', authenticateToken, checkOwnerAccess, async (req, res) => {
  try {
    const user = await User.findById(req.effectiveUserId).select('aiPreferences');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      preferences: user.aiPreferences,
      isAvailable: aiService.isAvailable()
    });
  } catch (error) {
    console.error('Error fetching AI preferences:', error);
    res.status(500).json({ message: 'Failed to fetch AI preferences' });
  }
});

// Update AI preferences
router.put('/preferences', authenticateToken, checkOwnerAccess, async (req, res) => {
  try {
    const { enableBookingRecommendations, enableSmartScheduling, preferredLanguage } = req.body;

    const updateData = {};
    if (typeof enableBookingRecommendations === 'boolean') {
      updateData['aiPreferences.enableBookingRecommendations'] = enableBookingRecommendations;
    }
    if (typeof enableSmartScheduling === 'boolean') {
      updateData['aiPreferences.enableSmartScheduling'] = enableSmartScheduling;
    }
    if (preferredLanguage && ['en', 'am', 'sw'].includes(preferredLanguage)) {
      updateData['aiPreferences.preferredLanguage'] = preferredLanguage;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No valid preferences provided' });
    }

    const user = await User.findByIdAndUpdate(
      req.effectiveUserId,
      { $set: updateData },
      { new: true }
    ).select('aiPreferences');

    res.json({
      message: 'AI preferences updated successfully',
      preferences: user.aiPreferences
    });
  } catch (error) {
    console.error('Error updating AI preferences:', error);
    res.status(500).json({ message: 'Failed to update AI preferences' });
  }
});

// Analyze booking patterns
router.get('/analytics/patterns', 
  authenticateToken, 
  checkOwnerAccess,
  checkFeatureAccess('advanced_analytics'),
  async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(days));

      const bookings = await Booking.find({
        userId: req.effectiveUserId,
        date: { $gte: daysAgo },
        status: { $in: ['completed', 'confirmed'] }
      }).populate('customerId', 'name').populate('serviceId', 'name');

      // Analyze patterns
      const patterns = {
        timePreferences: {},
        dayPreferences: {},
        servicePopularity: {},
        customerFrequency: {},
        seasonalTrends: {}
      };

      bookings.forEach(booking => {
        const hour = parseInt(booking.time.split(':')[0]);
        const dayOfWeek = new Date(booking.date).getDay();
        const month = new Date(booking.date).getMonth();
        
        // Time preferences
        patterns.timePreferences[hour] = (patterns.timePreferences[hour] || 0) + 1;
        
        // Day preferences
        patterns.dayPreferences[dayOfWeek] = (patterns.dayPreferences[dayOfWeek] || 0) + 1;
        
        // Service popularity
        const serviceName = booking.serviceId?.name || 'Unknown';
        patterns.servicePopularity[serviceName] = (patterns.servicePopularity[serviceName] || 0) + 1;
        
        // Customer frequency
        const customerName = booking.customerId?.name || 'Unknown';
        patterns.customerFrequency[customerName] = (patterns.customerFrequency[customerName] || 0) + 1;
        
        // Seasonal trends
        patterns.seasonalTrends[month] = (patterns.seasonalTrends[month] || 0) + 1;
      });

      // Get top items for each category
      const analytics = {
        totalBookings: bookings.length,
        dateRange: {
          from: daysAgo.toISOString().split('T')[0],
          to: new Date().toISOString().split('T')[0]
        },
        peakHours: Object.entries(patterns.timePreferences)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 3)
          .map(([hour, count]) => ({ hour: parseInt(hour), count })),
        busyDays: Object.entries(patterns.dayPreferences)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 3)
          .map(([day, count]) => ({ 
            day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day], 
            count 
          })),
        topServices: Object.entries(patterns.servicePopularity)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([service, count]) => ({ service, count })),
        topCustomers: Object.entries(patterns.customerFrequency)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([customer, count]) => ({ customer, count })),
        insights: await this.generateInsights(patterns, bookings.length)
      };

      res.json(analytics);
    } catch (error) {
      console.error('Error analyzing booking patterns:', error);
      res.status(500).json({ message: 'Failed to analyze booking patterns' });
    }
  }
);

// Generate AI insights for business optimization
router.get('/insights/optimization',
  authenticateToken,
  checkOwnerAccess,
  checkFeatureAccess('ai_recommendations'),
  async (req, res) => {
    try {
      const user = await User.findById(req.effectiveUserId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Get recent booking data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentBookings = await Booking.find({
        userId: req.effectiveUserId,
        date: { $gte: thirtyDaysAgo }
      });

      const insights = {
        businessHealth: {
          totalBookings: recentBookings.length,
          averageBookingsPerDay: recentBookings.length / 30,
          completionRate: recentBookings.filter(b => b.status === 'completed').length / recentBookings.length * 100,
          noShowRate: recentBookings.filter(b => b.status === 'no-show').length / recentBookings.length * 100
        },
        recommendations: [],
        opportunities: []
      };

      // Generate recommendations based on data
      if (insights.businessHealth.averageBookingsPerDay < 2) {
        insights.recommendations.push({
          type: 'growth',
          priority: 'high',
          title: 'Increase booking frequency',
          description: 'Consider marketing campaigns or service promotions to increase daily bookings.'
        });
      }

      if (insights.businessHealth.noShowRate > 10) {
        insights.recommendations.push({
          type: 'retention',
          priority: 'medium',
          title: 'Reduce no-show rate',
          description: 'Implement reminder systems or require deposits to reduce no-shows.'
        });
      }

      if (user.notificationSettings.emailReminders === false) {
        insights.recommendations.push({
          type: 'automation',
          priority: 'medium',
          title: 'Enable email reminders',
          description: 'Automated reminders can improve customer satisfaction and reduce no-shows.'
        });
      }

      // Identify opportunities
      const businessHours = user.businessHours;
      const closedDays = Object.entries(businessHours)
        .filter(([day, hours]) => !hours.isOpen)
        .map(([day]) => day);

      if (closedDays.length > 2) {
        insights.opportunities.push({
          type: 'schedule',
          impact: 'high',
          title: 'Extended business hours',
          description: `Consider opening on ${closedDays.join(', ')} to capture more bookings.`
        });
      }

      res.json(insights);
    } catch (error) {
      console.error('Error generating optimization insights:', error);
      res.status(500).json({ message: 'Failed to generate optimization insights' });
    }
  }
);

// Calculate booking score for existing booking
router.post('/booking/score',
  authenticateToken,
  checkOwnerAccess,
  checkFeatureAccess('ai_recommendations'),
  async (req, res) => {
    try {
      const { bookingId } = req.body;

      if (!bookingId) {
        return res.status(400).json({ message: 'Booking ID is required' });
      }

      const booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }

      // Check ownership
      if (booking.userId.toString() !== req.effectiveUserId.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const score = await booking.calculateRecommendationScore();

      res.json({
        bookingId,
        score: booking.aiRecommendationScore,
        factors: booking.recommendationFactors,
        isRecommended: booking.isRecommendedBooking,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Error calculating booking score:', error);
      res.status(500).json({ message: 'Failed to calculate booking score' });
    }
  }
);

// Get available time slots with AI scoring
router.get('/slots/available',
  authenticateToken,
  checkOwnerAccess,
  async (req, res) => {
    try {
      const { date, serviceId, customerId } = req.query;

      if (!date || !serviceId) {
        return res.status(400).json({ 
          message: 'Date and service ID are required' 
        });
      }

      // Use the existing static method from Booking model
      const recommendations = await Booking.getRecommendations(
        req.effectiveUserId,
        customerId,
        serviceId,
        new Date(date)
      );

      res.json({
        date,
        serviceId,
        customerId,
        availableSlots: recommendations
      });
    } catch (error) {
      console.error('Error fetching available slots:', error);
      res.status(500).json({ message: 'Failed to fetch available slots' });
    }
  }
);

// Helper function to generate insights
async function generateInsights(patterns, totalBookings) {
  const insights = [];

  // Peak time insights
  const peakHour = Object.entries(patterns.timePreferences)
    .sort(([,a], [,b]) => b - a)[0];
  
  if (peakHour) {
    insights.push({
      type: 'peak_time',
      message: `Your busiest hour is ${peakHour[0]}:00 with ${peakHour[1]} bookings`
    });
  }

  // Service insights
  const topService = Object.entries(patterns.servicePopularity)
    .sort(([,a], [,b]) => b - a)[0];
  
  if (topService) {
    const percentage = ((topService[1] / totalBookings) * 100).toFixed(1);
    insights.push({
      type: 'popular_service',
      message: `${topService[0]} is your most popular service (${percentage}% of bookings)`
    });
  }

  // Customer retention insight
  const repeatCustomers = Object.values(patterns.customerFrequency)
    .filter(count => count > 1).length;
  const totalCustomers = Object.keys(patterns.customerFrequency).length;
  
  if (totalCustomers > 0) {
    const retentionRate = ((repeatCustomers / totalCustomers) * 100).toFixed(1);
    insights.push({
      type: 'retention',
      message: `${retentionRate}% of your customers are repeat customers`
    });
  }

  return insights;
}

export default router;