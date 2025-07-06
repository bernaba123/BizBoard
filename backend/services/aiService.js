import OpenAI from 'openai';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import Customer from '../models/Customer.js';
import Service from '../models/Service.js';

// Initialize OpenAI client
const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

class AIService {
  constructor() {
    this.enabled = !!process.env.OPENAI_API_KEY;
  }

  // Get booking recommendations for a customer
  async getBookingRecommendations(userId, customerId, serviceId, preferredDate, preferredTime = null) {
    try {
      const user = await User.findById(userId);
      const customer = await Customer.findById(customerId);
      const service = await Service.findById(serviceId);

      if (!user || !customer || !service) {
        throw new Error('User, customer, or service not found');
      }

      // Use AI-powered recommendations if enabled and available
      if (this.enabled && user.aiPreferences.enableBookingRecommendations) {
        return await this.getAIRecommendations(user, customer, service, preferredDate, preferredTime);
      } else {
        // Fall back to rule-based recommendations
        return await this.getRuleBasedRecommendations(user, customer, service, preferredDate, preferredTime);
      }
    } catch (error) {
      console.error('Error getting booking recommendations:', error);
      // Fallback to rule-based if AI fails
      return await this.getRuleBasedRecommendations(
        await User.findById(userId),
        await Customer.findById(customerId),
        await Service.findById(serviceId),
        preferredDate,
        preferredTime
      );
    }
  }

  // AI-powered recommendations using OpenAI
  async getAIRecommendations(user, customer, service, preferredDate, preferredTime) {
    try {
      // Get customer's booking history
      const bookingHistory = await Booking.find({
        customerId: customer._id,
        status: 'completed'
      }).sort({ date: -1 }).limit(10);

      // Get business patterns
      const businessPatterns = await this.getBusinessPatterns(user._id);

      // Prepare context for AI
      const context = {
        businessName: user.businessName,
        businessType: user.businessType,
        businessHours: user.businessHours,
        service: {
          name: service.name,
          duration: service.duration,
          price: service.price
        },
        customer: {
          name: customer.name,
          bookingHistory: bookingHistory.map(b => ({
            date: b.date,
            time: b.time,
            service: b.serviceId,
            rating: b.rating,
            notes: b.notes
          }))
        },
        preferredDate,
        preferredTime,
        businessPatterns
      };

      const prompt = this.buildRecommendationPrompt(context);

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are an AI assistant specialized in booking optimization for service businesses. Provide practical, data-driven booking recommendations that consider customer preferences, business patterns, and operational efficiency."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      const aiRecommendation = response.choices[0].message.content;

      // Parse AI response and combine with rule-based recommendations
      const ruleBasedRecommendations = await this.getRuleBasedRecommendations(user, customer, service, preferredDate, preferredTime);
      
      return {
        type: 'ai-powered',
        recommendations: ruleBasedRecommendations,
        aiInsights: aiRecommendation,
        confidence: this.calculateConfidenceScore(bookingHistory, businessPatterns)
      };

    } catch (error) {
      console.error('AI recommendation error:', error);
      // Fallback to rule-based
      const ruleBasedRecommendations = await this.getRuleBasedRecommendations(user, customer, service, preferredDate, preferredTime);
      return {
        type: 'rule-based-fallback',
        recommendations: ruleBasedRecommendations,
        error: 'AI service temporarily unavailable'
      };
    }
  }

  // Rule-based recommendations
  async getRuleBasedRecommendations(user, customer, service, preferredDate, preferredTime) {
    try {
      const recommendations = [];
      const targetDate = new Date(preferredDate);
      const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][targetDate.getDay()];
      
      const businessHours = user.businessHours[dayOfWeek];
      
      if (!businessHours.isOpen) {
        return {
          type: 'rule-based',
          recommendations: [],
          message: `Business is closed on ${dayOfWeek}s`
        };
      }

      // Get existing bookings for the date
      const existingBookings = await Booking.find({
        userId: user._id,
        date: targetDate,
        status: { $nin: ['cancelled'] }
      }).sort({ time: 1 });

      // Get customer's booking history for pattern analysis
      const customerHistory = await Booking.find({
        customerId: customer._id,
        status: 'completed'
      }).sort({ date: -1 }).limit(5);

      // Generate time slots
      const timeSlots = this.generateTimeSlots(businessHours, service.duration);
      
      for (const slot of timeSlots) {
        const slotScore = await this.calculateSlotScore(
          slot,
          existingBookings,
          customerHistory,
          user,
          service,
          preferredTime
        );

        if (slotScore.available) {
          recommendations.push({
            time: slot.time,
            endTime: slot.endTime,
            score: slotScore.score,
            factors: slotScore.factors,
            reason: slotScore.reason
          });
        }
      }

      // Sort by score (highest first) and return top 5
      recommendations.sort((a, b) => b.score - a.score);

      return {
        type: 'rule-based',
        recommendations: recommendations.slice(0, 5),
        totalAvailable: recommendations.length
      };

    } catch (error) {
      console.error('Rule-based recommendation error:', error);
      return {
        type: 'error',
        recommendations: [],
        error: 'Unable to generate recommendations'
      };
    }
  }

  // Generate available time slots
  generateTimeSlots(businessHours, serviceDuration) {
    const slots = [];
    const openTime = businessHours.open;
    const closeTime = businessHours.close;

    const [openHour, openMin] = openTime.split(':').map(Number);
    const [closeHour, closeMin] = closeTime.split(':').map(Number);

    const openMinutes = openHour * 60 + openMin;
    const closeMinutes = closeHour * 60 + closeMin;

    // Generate slots every 30 minutes
    for (let minutes = openMinutes; minutes + serviceDuration <= closeMinutes; minutes += 30) {
      const startHour = Math.floor(minutes / 60);
      const startMin = minutes % 60;
      
      const endMinutes = minutes + serviceDuration;
      const endHour = Math.floor(endMinutes / 60);
      const endMin = endMinutes % 60;

      slots.push({
        time: `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`,
        endTime: `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`,
        minutes: minutes,
        endMinutes: endMinutes
      });
    }

    return slots;
  }

  // Calculate score for a time slot
  async calculateSlotScore(slot, existingBookings, customerHistory, user, service, preferredTime) {
    const factors = {
      availability: 0,
      customerPreference: 0,
      businessOptimal: 0,
      historicalDemand: 0,
      bufferTime: 0
    };

    // Check availability (base requirement)
    const isAvailable = !existingBookings.some(booking => {
      const bookingStart = this.timeToMinutes(booking.time);
      const bookingEnd = this.timeToMinutes(booking.endTime);
      return (slot.minutes < bookingEnd && slot.endMinutes > bookingStart);
    });

    if (!isAvailable) {
      return { available: false, score: 0, factors, reason: 'Time slot unavailable' };
    }

    factors.availability = 25; // Base points for being available

    // Customer preference factor
    if (preferredTime && slot.time === preferredTime) {
      factors.customerPreference = 30;
    } else if (customerHistory.length > 0) {
      const preferredTimes = customerHistory.map(b => b.time);
      const timeFrequency = preferredTimes.filter(t => t === slot.time).length;
      factors.customerPreference = Math.min(25, timeFrequency * 8);
    } else {
      factors.customerPreference = 10; // Neutral for new customers
    }

    // Business optimal factor (mid-day bookings often preferred)
    const slotHour = Math.floor(slot.minutes / 60);
    if (slotHour >= 10 && slotHour <= 14) {
      factors.businessOptimal = 20;
    } else if (slotHour >= 9 && slotHour <= 16) {
      factors.businessOptimal = 15;
    } else {
      factors.businessOptimal = 5;
    }

    // Historical demand factor
    const sameTimeBookings = await Booking.countDocuments({
      userId: user._id,
      time: slot.time,
      status: 'completed'
    });
    factors.historicalDemand = Math.min(15, sameTimeBookings * 3);

    // Buffer time factor (prefer slots with gaps)
    const hasBufferBefore = !existingBookings.some(b => 
      this.timeToMinutes(b.endTime) === slot.minutes - 30
    );
    const hasBufferAfter = !existingBookings.some(b => 
      this.timeToMinutes(b.time) === slot.endMinutes + 30
    );
    
    if (hasBufferBefore && hasBufferAfter) {
      factors.bufferTime = 10;
    } else if (hasBufferBefore || hasBufferAfter) {
      factors.bufferTime = 5;
    }

    const totalScore = Object.values(factors).reduce((sum, score) => sum + score, 0);

    let reason = 'Available slot';
    if (factors.customerPreference > 20) reason = 'Matches your usual time preference';
    else if (factors.businessOptimal > 15) reason = 'Optimal business hours';
    else if (factors.bufferTime > 5) reason = 'Good spacing between appointments';

    return {
      available: true,
      score: totalScore,
      factors,
      reason
    };
  }

  // Get business patterns for AI context
  async getBusinessPatterns(userId) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentBookings = await Booking.find({
        userId,
        date: { $gte: thirtyDaysAgo },
        status: { $in: ['completed', 'confirmed'] }
      });

      const patterns = {
        busyDays: {},
        busyTimes: {},
        averageBookingsPerDay: 0,
        peakHours: [],
        customerReturnRate: 0
      };

      // Analyze busy days
      recentBookings.forEach(booking => {
        const dayOfWeek = new Date(booking.date).getDay();
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
        patterns.busyDays[dayName] = (patterns.busyDays[dayName] || 0) + 1;
      });

      // Analyze busy times
      recentBookings.forEach(booking => {
        const hour = parseInt(booking.time.split(':')[0]);
        patterns.busyTimes[hour] = (patterns.busyTimes[hour] || 0) + 1;
      });

      // Calculate average bookings per day
      patterns.averageBookingsPerDay = recentBookings.length / 30;

      // Find peak hours
      const sortedHours = Object.entries(patterns.busyTimes)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([hour]) => parseInt(hour));
      patterns.peakHours = sortedHours;

      return patterns;

    } catch (error) {
      console.error('Error analyzing business patterns:', error);
      return null;
    }
  }

  // Build prompt for AI recommendations
  buildRecommendationPrompt(context) {
    return `
      I need booking recommendations for ${context.businessName} (${context.businessType} business).
      
      Customer: ${context.customer.name}
      Service: ${context.service.name} (${context.service.duration} min, $${context.service.price})
      Preferred Date: ${context.preferredDate}
      ${context.preferredTime ? `Preferred Time: ${context.preferredTime}` : ''}
      
      Customer's booking history:
      ${context.customer.bookingHistory.map(b => 
        `- ${b.date}: ${b.time} (Rating: ${b.rating || 'N/A'})`
      ).join('\n')}
      
      Business Hours: ${JSON.stringify(context.businessHours)}
      
      Business Patterns:
      ${context.businessPatterns ? `
      - Average bookings per day: ${context.businessPatterns.averageBookingsPerDay}
      - Peak hours: ${context.businessPatterns.peakHours.join(', ')}
      - Busiest days: ${Object.entries(context.businessPatterns.busyDays || {})
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([day, count]) => `${day} (${count})`)
        .join(', ')}
      ` : 'No recent patterns available'}
      
      Please provide insights on:
      1. Best time recommendations for this customer
      2. Considerations for business efficiency
      3. Any seasonal or demand-based factors
      4. Customer satisfaction optimization tips
      
      Keep the response concise and practical.
    `;
  }

  // Calculate confidence score for AI recommendations
  calculateConfidenceScore(bookingHistory, businessPatterns) {
    let confidence = 50; // Base confidence

    // More history = higher confidence
    if (bookingHistory.length >= 5) confidence += 20;
    else if (bookingHistory.length >= 2) confidence += 10;

    // Business patterns available
    if (businessPatterns && businessPatterns.averageBookingsPerDay > 1) confidence += 15;

    // Recent customer activity
    if (bookingHistory.length > 0) {
      const lastBooking = new Date(bookingHistory[0].date);
      const daysSinceLastBooking = (Date.now() - lastBooking.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastBooking < 30) confidence += 10;
    }

    return Math.min(95, confidence);
  }

  // Utility function to convert time string to minutes
  timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Get smart scheduling suggestions for multiple customers
  async getSmartSchedulingSuggestions(userId, date, customerRequests) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.aiPreferences.enableSmartScheduling) {
        return null;
      }

      const suggestions = [];
      const existingBookings = await Booking.find({
        userId,
        date: new Date(date),
        status: { $nin: ['cancelled'] }
      }).sort({ time: 1 });

      // Use AI to optimize scheduling if available
      if (this.enabled) {
        const context = {
          date,
          existingBookings: existingBookings.map(b => ({
            time: b.time,
            duration: b.duration,
            service: b.serviceId
          })),
          customerRequests,
          businessHours: user.businessHours
        };

        const optimizationPrompt = `
          Optimize the following booking schedule for ${date}:
          
          Existing bookings: ${JSON.stringify(context.existingBookings)}
          New requests: ${JSON.stringify(customerRequests)}
          Business hours: ${JSON.stringify(user.businessHours)}
          
          Suggest the most efficient arrangement considering:
          1. Minimizing gaps between appointments
          2. Customer preferences
          3. Service requirements
          4. Travel time if applicable
          
          Provide a structured schedule recommendation.
        `;

        try {
          const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content: "You are a scheduling optimization expert. Provide practical, efficient booking arrangements."
              },
              {
                role: "user",
                content: optimizationPrompt
              }
            ],
            max_tokens: 400
          });

          suggestions.push({
            type: 'ai-optimized',
            recommendation: response.choices[0].message.content
          });

        } catch (error) {
          console.error('AI scheduling optimization error:', error);
        }
      }

      // Add rule-based suggestions as backup
      suggestions.push({
        type: 'rule-based',
        recommendation: await this.getRuleBasedScheduleOptimization(existingBookings, customerRequests, user)
      });

      return suggestions;

    } catch (error) {
      console.error('Error generating smart scheduling suggestions:', error);
      return null;
    }
  }

  // Rule-based schedule optimization
  async getRuleBasedScheduleOptimization(existingBookings, customerRequests, user) {
    // Simple rule-based optimization
    const suggestions = [];

    // Sort requests by priority/flexibility
    const sortedRequests = customerRequests.sort((a, b) => {
      if (a.flexible && !b.flexible) return 1;
      if (!a.flexible && b.flexible) return -1;
      return 0;
    });

    // Try to minimize gaps
    let lastEndTime = null;
    for (const booking of existingBookings) {
      if (lastEndTime) {
        const gap = this.timeToMinutes(booking.time) - this.timeToMinutes(lastEndTime);
        if (gap > 60) { // Gap longer than 1 hour
          suggestions.push(`Consider filling ${gap}-minute gap between ${lastEndTime} and ${booking.time}`);
        }
      }
      lastEndTime = booking.endTime;
    }

    return suggestions.join('. ');
  }

  // Check if AI service is available
  isAvailable() {
    return this.enabled;
  }

  // Get AI service status
  getStatus() {
    return {
      enabled: this.enabled,
      provider: 'OpenAI GPT-3.5',
      features: [
        'Booking recommendations',
        'Smart scheduling',
        'Customer preference analysis',
        'Business pattern recognition'
      ]
    };
  }
}

export default new AIService();