import nodemailer from 'nodemailer';
import twilio from 'twilio';
import Bull from 'bull';
import Redis from 'redis';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import Customer from '../models/Customer.js';

// Initialize Redis client for Bull queue
const redis = Redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
});

// Initialize Bull queue for reminder jobs
const reminderQueue = new Bull('reminder queue', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  }
});

// Initialize Twilio client
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.initializeEmailTransporter();
    this.setupQueueProcessors();
  }

  // Initialize email transporter
  initializeEmailTransporter() {
    try {
      this.emailTransporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    } catch (error) {
      console.error('Failed to initialize email transporter:', error);
    }
  }

  // Setup queue processors
  setupQueueProcessors() {
    // Process email reminder jobs
    reminderQueue.process('email-reminder', async (job) => {
      const { bookingId, type } = job.data;
      await this.processEmailReminder(bookingId, type);
    });

    // Process SMS reminder jobs
    reminderQueue.process('sms-reminder', async (job) => {
      const { bookingId, type } = job.data;
      await this.processSMSReminder(bookingId, type);
    });

    // Handle job completion
    reminderQueue.on('completed', (job) => {
      console.log(`Reminder job ${job.id} completed`);
    });

    // Handle job failures
    reminderQueue.on('failed', (job, err) => {
      console.error(`Reminder job ${job.id} failed:`, err);
    });
  }

  // Schedule reminder for a booking
  async scheduleBookingReminders(bookingId) {
    try {
      const booking = await Booking.findById(bookingId)
        .populate('userId customerId serviceId');
      
      if (!booking) {
        throw new Error('Booking not found');
      }

      const user = booking.userId;
      const customer = booking.customerId;
      const settings = user.notificationSettings;

      if (!settings) return;

      const bookingDateTime = new Date(booking.date);
      const [hours, minutes] = booking.time.split(':').map(Number);
      bookingDateTime.setHours(hours, minutes, 0, 0);

      // Calculate reminder time
      const reminderTime = new Date(bookingDateTime.getTime() - (settings.reminderHoursBefore * 60 * 60 * 1000));
      const now = new Date();

      // Only schedule if reminder time is in the future
      if (reminderTime > now) {
        const delay = reminderTime.getTime() - now.getTime();

        // Schedule email reminder
        if (settings.emailReminders && customer.email) {
          await reminderQueue.add('email-reminder', {
            bookingId: bookingId.toString(),
            type: 'reminder'
          }, {
            delay,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 }
          });
        }

        // Schedule SMS reminder
        if (settings.smsReminders && customer.phone && twilioClient) {
          await reminderQueue.add('sms-reminder', {
            bookingId: bookingId.toString(),
            type: 'reminder'
          }, {
            delay,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 }
          });
        }

        // Mark reminder as scheduled
        booking.reminders.reminderScheduled = true;
        await booking.save();
      }

      // Send immediate confirmation if enabled
      if (settings.bookingConfirmations) {
        await this.sendBookingConfirmation(bookingId);
      }

    } catch (error) {
      console.error('Error scheduling booking reminders:', error);
      throw error;
    }
  }

  // Process email reminder job
  async processEmailReminder(bookingId, type) {
    try {
      const booking = await Booking.findById(bookingId)
        .populate('userId customerId serviceId');
      
      if (!booking) return;

      const user = booking.userId;
      const customer = booking.customerId;
      const service = booking.serviceId;

      let subject, template;

      switch (type) {
        case 'reminder':
          subject = `Reminder: Upcoming appointment with ${user.businessName}`;
          template = this.getEmailReminderTemplate(booking, user, customer, service);
          break;
        case 'confirmation':
          subject = `Booking confirmed with ${user.businessName}`;
          template = this.getEmailConfirmationTemplate(booking, user, customer, service);
          break;
        default:
          return;
      }

      const mailOptions = {
        from: `"${user.businessName}" <${process.env.SMTP_USER}>`,
        to: customer.email,
        subject,
        html: template
      };

      await this.emailTransporter.sendMail(mailOptions);

      // Update booking reminder status
      if (type === 'reminder') {
        booking.reminders.emailSent = true;
        booking.reminders.emailSentAt = new Date();
      } else if (type === 'confirmation') {
        booking.reminders.confirmationSent = true;
        booking.reminders.confirmationSentAt = new Date();
      }

      await booking.save();

    } catch (error) {
      console.error('Error processing email reminder:', error);
      throw error;
    }
  }

  // Process SMS reminder job
  async processSMSReminder(bookingId, type) {
    try {
      if (!twilioClient) {
        console.warn('Twilio not configured, skipping SMS reminder');
        return;
      }

      const booking = await Booking.findById(bookingId)
        .populate('userId customerId serviceId');
      
      if (!booking) return;

      const user = booking.userId;
      const customer = booking.customerId;
      const service = booking.serviceId;

      let message;

      switch (type) {
        case 'reminder':
          message = this.getSMSReminderTemplate(booking, user, customer, service);
          break;
        case 'confirmation':
          message = this.getSMSConfirmationTemplate(booking, user, customer, service);
          break;
        default:
          return;
      }

      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: customer.phone
      });

      // Update booking reminder status
      if (type === 'reminder') {
        booking.reminders.smsSent = true;
        booking.reminders.smsSentAt = new Date();
      }

      await booking.save();

    } catch (error) {
      console.error('Error processing SMS reminder:', error);
      throw error;
    }
  }

  // Send immediate booking confirmation
  async sendBookingConfirmation(bookingId) {
    try {
      const booking = await Booking.findById(bookingId)
        .populate('userId customerId serviceId');
      
      if (!booking) return;

      const user = booking.userId;
      const settings = user.notificationSettings;

      // Send email confirmation
      if (settings.emailReminders && booking.customerId.email) {
        await reminderQueue.add('email-reminder', {
          bookingId: bookingId.toString(),
          type: 'confirmation'
        }, { attempts: 3 });
      }

      // Send SMS confirmation
      if (settings.smsReminders && booking.customerId.phone && twilioClient) {
        await reminderQueue.add('sms-reminder', {
          bookingId: bookingId.toString(),
          type: 'confirmation'
        }, { attempts: 3 });
      }

    } catch (error) {
      console.error('Error sending booking confirmation:', error);
      throw error;
    }
  }

  // Email templates
  getEmailReminderTemplate(booking, user, customer, service) {
    const bookingDate = new Date(booking.date).toLocaleDateString();
    const bookingTime = booking.time;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .booking-details { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .footer { background: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; }
            .button { background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Appointment Reminder</h1>
            </div>
            <div class="content">
              <h2>Hello ${customer.name},</h2>
              <p>This is a friendly reminder about your upcoming appointment with <strong>${user.businessName}</strong>.</p>
              
              <div class="booking-details">
                <h3>Appointment Details:</h3>
                <p><strong>Service:</strong> ${service.name}</p>
                <p><strong>Date:</strong> ${bookingDate}</p>
                <p><strong>Time:</strong> ${bookingTime}</p>
                <p><strong>Duration:</strong> ${booking.duration} minutes</p>
                ${booking.notes ? `<p><strong>Notes:</strong> ${booking.notes}</p>` : ''}
              </div>

              <p>If you need to reschedule or cancel, please contact us as soon as possible.</p>
              
              <a href="tel:${user.phone}" class="button">Call ${user.businessName}</a>
            </div>
            <div class="footer">
              <p>This reminder was sent by ${user.businessName}</p>
              <p>Powered by BizBoard</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  getEmailConfirmationTemplate(booking, user, customer, service) {
    const bookingDate = new Date(booking.date).toLocaleDateString();
    const bookingTime = booking.time;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
            .header { background: #10b981; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .booking-details { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .footer { background: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; }
            .success { color: #10b981; font-size: 18px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✓ Booking Confirmed</h1>
            </div>
            <div class="content">
              <h2>Hello ${customer.name},</h2>
              <p class="success">Your appointment has been confirmed!</p>
              <p>Thank you for booking with <strong>${user.businessName}</strong>.</p>
              
              <div class="booking-details">
                <h3>Appointment Details:</h3>
                <p><strong>Service:</strong> ${service.name}</p>
                <p><strong>Date:</strong> ${bookingDate}</p>
                <p><strong>Time:</strong> ${bookingTime}</p>
                <p><strong>Duration:</strong> ${booking.duration} minutes</p>
                <p><strong>Total Amount:</strong> $${booking.totalAmount}</p>
                ${booking.notes ? `<p><strong>Notes:</strong> ${booking.notes}</p>` : ''}
              </div>

              <p>We look forward to serving you. If you have any questions, please don't hesitate to contact us.</p>
            </div>
            <div class="footer">
              <p>Booking confirmed by ${user.businessName}</p>
              <p>Powered by BizBoard</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // SMS templates
  getSMSReminderTemplate(booking, user, customer, service) {
    const bookingDate = new Date(booking.date).toLocaleDateString();
    const bookingTime = booking.time;

    return `Reminder: You have an appointment with ${user.businessName} tomorrow (${bookingDate}) at ${bookingTime} for ${service.name}. Contact: ${user.phone}`;
  }

  getSMSConfirmationTemplate(booking, user, customer, service) {
    const bookingDate = new Date(booking.date).toLocaleDateString();
    const bookingTime = booking.time;

    return `✓ Booking confirmed with ${user.businessName} on ${bookingDate} at ${bookingTime} for ${service.name}. Total: $${booking.totalAmount}`;
  }

  // Cancel scheduled reminders
  async cancelScheduledReminders(bookingId) {
    try {
      // Find and remove jobs related to this booking
      const jobs = await reminderQueue.getJobs(['delayed']);
      for (const job of jobs) {
        if (job.data.bookingId === bookingId.toString()) {
          await job.remove();
        }
      }
    } catch (error) {
      console.error('Error cancelling scheduled reminders:', error);
    }
  }

  // Send custom notification
  async sendCustomNotification(userId, customerId, subject, message, type = 'email') {
    try {
      const user = await User.findById(userId);
      const customer = await Customer.findById(customerId);

      if (!user || !customer) {
        throw new Error('User or customer not found');
      }

      if (type === 'email' && customer.email) {
        const mailOptions = {
          from: `"${user.businessName}" <${process.env.SMTP_USER}>`,
          to: customer.email,
          subject,
          html: `
            <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
              <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
                <h1>${user.businessName}</h1>
              </div>
              <div style="padding: 20px;">
                <h2>Hello ${customer.name},</h2>
                <p>${message}</p>
              </div>
              <div style="background: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280;">
                <p>Sent by ${user.businessName}</p>
                <p>Powered by BizBoard</p>
              </div>
            </div>
          `
        };

        await this.emailTransporter.sendMail(mailOptions);
      } else if (type === 'sms' && customer.phone && twilioClient) {
        await twilioClient.messages.create({
          body: `${user.businessName}: ${message}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: customer.phone
        });
      }

    } catch (error) {
      console.error('Error sending custom notification:', error);
      throw error;
    }
  }

  // Get queue stats
  async getQueueStats() {
    try {
      const waiting = await reminderQueue.getWaiting();
      const active = await reminderQueue.getActive();
      const completed = await reminderQueue.getCompleted();
      const failed = await reminderQueue.getFailed();

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return null;
    }
  }
}

export default new NotificationService();