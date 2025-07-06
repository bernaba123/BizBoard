import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { checkOwnerAccess, checkFeatureAccess } from '../middleware/rbac.js';
import notificationService from '../services/notificationService.js';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import Customer from '../models/Customer.js';

const router = express.Router();

// Get notification settings
router.get('/settings', authenticateToken, checkOwnerAccess, async (req, res) => {
  try {
    const user = await User.findById(req.effectiveUserId).select('notificationSettings');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      settings: user.notificationSettings,
      queueStats: await notificationService.getQueueStats()
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({ message: 'Failed to fetch notification settings' });
  }
});

// Update notification settings
router.put('/settings', authenticateToken, checkOwnerAccess, async (req, res) => {
  try {
    const { 
      emailReminders, 
      smsReminders, 
      bookingConfirmations, 
      reminderHoursBefore 
    } = req.body;

    const updateData = {};
    
    if (typeof emailReminders === 'boolean') {
      updateData['notificationSettings.emailReminders'] = emailReminders;
    }
    if (typeof smsReminders === 'boolean') {
      updateData['notificationSettings.smsReminders'] = smsReminders;
    }
    if (typeof bookingConfirmations === 'boolean') {
      updateData['notificationSettings.bookingConfirmations'] = bookingConfirmations;
    }
    if (typeof reminderHoursBefore === 'number' && reminderHoursBefore >= 1 && reminderHoursBefore <= 168) {
      updateData['notificationSettings.reminderHoursBefore'] = reminderHoursBefore;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No valid settings provided' });
    }

    const user = await User.findByIdAndUpdate(
      req.effectiveUserId,
      { $set: updateData },
      { new: true }
    ).select('notificationSettings');

    res.json({
      message: 'Notification settings updated successfully',
      settings: user.notificationSettings
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ message: 'Failed to update notification settings' });
  }
});

// Send custom notification
router.post('/send-custom', 
  authenticateToken, 
  checkOwnerAccess,
  checkFeatureAccess('reminders'),
  async (req, res) => {
    try {
      const { customerId, subject, message, type = 'email' } = req.body;

      if (!customerId || !subject || !message) {
        return res.status(400).json({ 
          message: 'Customer ID, subject, and message are required' 
        });
      }

      if (!['email', 'sms'].includes(type)) {
        return res.status(400).json({ 
          message: 'Type must be either email or sms' 
        });
      }

      await notificationService.sendCustomNotification(
        req.effectiveUserId,
        customerId,
        subject,
        message,
        type
      );

      res.json({
        message: `${type.toUpperCase()} notification sent successfully`
      });
    } catch (error) {
      console.error('Error sending custom notification:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to send notification' 
      });
    }
  }
);

// Schedule reminder for booking
router.post('/schedule-reminder', 
  authenticateToken, 
  checkOwnerAccess,
  checkFeatureAccess('reminders'),
  async (req, res) => {
    try {
      const { bookingId } = req.body;

      if (!bookingId) {
        return res.status(400).json({ message: 'Booking ID is required' });
      }

      // Verify booking ownership
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }

      if (booking.userId.toString() !== req.effectiveUserId.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }

      await notificationService.scheduleBookingReminders(bookingId);

      res.json({
        message: 'Reminder scheduled successfully',
        bookingId
      });
    } catch (error) {
      console.error('Error scheduling reminder:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to schedule reminder' 
      });
    }
  }
);

// Cancel scheduled reminders for booking
router.post('/cancel-reminder', 
  authenticateToken, 
  checkOwnerAccess,
  async (req, res) => {
    try {
      const { bookingId } = req.body;

      if (!bookingId) {
        return res.status(400).json({ message: 'Booking ID is required' });
      }

      // Verify booking ownership
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }

      if (booking.userId.toString() !== req.effectiveUserId.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }

      await notificationService.cancelScheduledReminders(bookingId);

      res.json({
        message: 'Scheduled reminders cancelled successfully',
        bookingId
      });
    } catch (error) {
      console.error('Error cancelling reminders:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to cancel reminders' 
      });
    }
  }
);

// Get notification queue statistics
router.get('/queue/stats', 
  authenticateToken, 
  checkOwnerAccess,
  async (req, res) => {
    try {
      const stats = await notificationService.getQueueStats();
      
      res.json({
        queue: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching queue stats:', error);
      res.status(500).json({ message: 'Failed to fetch queue statistics' });
    }
  }
);

// Get notification history for a booking
router.get('/history/:bookingId', 
  authenticateToken, 
  checkOwnerAccess,
  async (req, res) => {
    try {
      const { bookingId } = req.params;

      const booking = await Booking.findById(bookingId)
        .select('reminders userId')
        .populate('customerId', 'name email phone');

      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }

      if (booking.userId.toString() !== req.effectiveUserId.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }

      res.json({
        bookingId,
        customer: booking.customerId,
        reminders: booking.reminders
      });
    } catch (error) {
      console.error('Error fetching notification history:', error);
      res.status(500).json({ message: 'Failed to fetch notification history' });
    }
  }
);

// Send booking confirmation
router.post('/send-confirmation', 
  authenticateToken, 
  checkOwnerAccess,
  async (req, res) => {
    try {
      const { bookingId } = req.body;

      if (!bookingId) {
        return res.status(400).json({ message: 'Booking ID is required' });
      }

      // Verify booking ownership
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }

      if (booking.userId.toString() !== req.effectiveUserId.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }

      await notificationService.sendBookingConfirmation(bookingId);

      res.json({
        message: 'Booking confirmation sent successfully',
        bookingId
      });
    } catch (error) {
      console.error('Error sending confirmation:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to send confirmation' 
      });
    }
  }
);

// Bulk send notifications to customers
router.post('/bulk-send', 
  authenticateToken, 
  checkOwnerAccess,
  checkFeatureAccess('reminders'),
  async (req, res) => {
    try {
      const { customerIds, subject, message, type = 'email' } = req.body;

      if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ 
          message: 'Customer IDs array is required' 
        });
      }

      if (!subject || !message) {
        return res.status(400).json({ 
          message: 'Subject and message are required' 
        });
      }

      if (!['email', 'sms'].includes(type)) {
        return res.status(400).json({ 
          message: 'Type must be either email or sms' 
        });
      }

      // Verify all customers belong to the user
      const customers = await Customer.find({
        _id: { $in: customerIds },
        userId: req.effectiveUserId
      });

      if (customers.length !== customerIds.length) {
        return res.status(403).json({ 
          message: 'Some customers do not belong to your account' 
        });
      }

      const results = {
        sent: 0,
        failed: 0,
        errors: []
      };

      for (const customer of customers) {
        try {
          await notificationService.sendCustomNotification(
            req.effectiveUserId,
            customer._id,
            subject,
            message,
            type
          );
          results.sent++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            customerId: customer._id,
            customerName: customer.name,
            error: error.message
          });
        }
      }

      res.json({
        message: `Bulk ${type} notification completed`,
        results
      });
    } catch (error) {
      console.error('Error sending bulk notifications:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to send bulk notifications' 
      });
    }
  }
);

// Get notification templates
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const templates = {
      email: {
        reminder: {
          name: 'Appointment Reminder',
          subject: 'Reminder: Upcoming appointment with {businessName}',
          body: `Hello {customerName},

This is a friendly reminder about your upcoming appointment.

Appointment Details:
- Service: {serviceName}
- Date: {appointmentDate}
- Time: {appointmentTime}
- Duration: {duration} minutes

If you need to reschedule or cancel, please contact us as soon as possible.

Best regards,
{businessName}
{businessPhone}`
        },
        confirmation: {
          name: 'Booking Confirmation',
          subject: 'Booking confirmed with {businessName}',
          body: `Hello {customerName},

Your appointment has been confirmed!

Appointment Details:
- Service: {serviceName}
- Date: {appointmentDate}
- Time: {appointmentTime}
- Duration: {duration} minutes
- Total Amount: ${totalAmount}

We look forward to serving you.

Best regards,
{businessName}
{businessPhone}`
        },
        followup: {
          name: 'Follow-up Message',
          subject: 'Thank you for choosing {businessName}',
          body: `Hello {customerName},

Thank you for your recent visit. We hope you were satisfied with our service.

If you have any feedback or would like to book another appointment, please don't hesitate to contact us.

Best regards,
{businessName}
{businessPhone}`
        }
      },
      sms: {
        reminder: {
          name: 'SMS Reminder',
          body: 'Reminder: You have an appointment with {businessName} on {appointmentDate} at {appointmentTime} for {serviceName}. Contact: {businessPhone}'
        },
        confirmation: {
          name: 'SMS Confirmation',
          body: '✓ Booking confirmed with {businessName} on {appointmentDate} at {appointmentTime} for {serviceName}. Total: ${totalAmount}'
        }
      }
    };

    res.json(templates);
  } catch (error) {
    console.error('Error fetching notification templates:', error);
    res.status(500).json({ message: 'Failed to fetch notification templates' });
  }
});

// Test notification configuration
router.post('/test', 
  authenticateToken, 
  checkOwnerAccess,
  async (req, res) => {
    try {
      const { type = 'email', recipient } = req.body;

      if (!recipient) {
        return res.status(400).json({ 
          message: 'Recipient email or phone number is required' 
        });
      }

      const user = await User.findById(req.effectiveUserId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const testMessage = type === 'email' 
        ? 'This is a test email from BizBoard to verify your notification configuration.'
        : 'This is a test SMS from BizBoard to verify your notification configuration.';

      // Create a test customer object
      const testCustomer = {
        name: 'Test Customer',
        email: type === 'email' ? recipient : user.email,
        phone: type === 'sms' ? recipient : user.phone
      };

      // This would need to be implemented in notificationService
      // For now, just return success
      res.json({
        message: `Test ${type} notification would be sent to ${recipient}`,
        status: 'success',
        note: 'This is a simulation - actual test sending not implemented yet'
      });
    } catch (error) {
      console.error('Error testing notification:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to test notification' 
      });
    }
  }
);

export default router;