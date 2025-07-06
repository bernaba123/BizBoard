import express from 'express';
import Stripe from 'stripe';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin, checkFeatureAccess, checkUsageLimit } from '../middleware/rbac.js';
import paymentService from '../services/paymentService.js';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

// Get current subscription info
router.get('/current', authenticateToken, async (req, res) => {
  try {
    const subscription = await paymentService.getSubscriptionInfo(req.user.userId);
    
    if (!subscription) {
      return res.status(404).json({ message: 'No subscription found' });
    }

    res.json(subscription);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ message: 'Failed to fetch subscription info' });
  }
});

// Get available plans and pricing
router.get('/plans', async (req, res) => {
  try {
    const currency = req.query.currency || 'USD';
    
    const plans = {
      free: {
        name: 'Free',
        price: 0,
        currency,
        interval: 'month',
        features: ['basic_booking', 'customer_management'],
        limits: {
          bookings: 50,
          services: 5,
          assistants: 0
        }
      },
      pro: {
        name: 'Pro',
        price: Subscription.getPlanPricing('pro', currency)?.monthly || 29,
        currency,
        interval: 'month',
        features: ['basic_booking', 'customer_management', 'ai_recommendations', 'reminders', 'basic_analytics'],
        limits: {
          bookings: 500,
          services: 50,
          assistants: 3
        }
      },
      business: {
        name: 'Business',
        price: Subscription.getPlanPricing('business', currency)?.monthly || 99,
        currency,
        interval: 'month',
        features: ['basic_booking', 'customer_management', 'ai_recommendations', 'reminders', 'advanced_analytics', 'rbac', 'white_label', 'api_access'],
        limits: {
          bookings: -1, // unlimited
          services: -1,
          assistants: -1
        }
      }
    };

    res.json({ plans, currency });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ message: 'Failed to fetch subscription plans' });
  }
});

// Create subscription
router.post('/create', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { planId, paymentMethodId, currency = 'USD' } = req.body;

    if (!planId || !paymentMethodId) {
      return res.status(400).json({ 
        message: 'Plan ID and payment method are required' 
      });
    }

    if (!['pro', 'business'].includes(planId)) {
      return res.status(400).json({ 
        message: 'Invalid plan ID' 
      });
    }

    const subscription = await paymentService.createSubscription(
      req.user.userId,
      planId,
      paymentMethodId,
      currency
    );

    res.status(201).json({
      message: 'Subscription created successfully',
      subscription
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ 
      message: error.message || 'Failed to create subscription' 
    });
  }
});

// Cancel subscription
router.post('/cancel', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { immediate = false } = req.body;

    const subscription = await paymentService.cancelSubscription(req.user.userId, immediate);

    res.json({
      message: immediate ? 'Subscription cancelled immediately' : 'Subscription will be cancelled at period end',
      subscription: {
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd
      }
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ 
      message: error.message || 'Failed to cancel subscription' 
    });
  }
});

// Get billing history
router.get('/billing/history', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user.userId });
    
    if (!subscription) {
      return res.status(404).json({ message: 'No subscription found' });
    }

    res.json({
      invoices: subscription.invoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      webhookEvents: subscription.webhookEvents.slice(-10) // Last 10 events
    });
  } catch (error) {
    console.error('Error fetching billing history:', error);
    res.status(500).json({ message: 'Failed to fetch billing history' });
  }
});

// Get usage statistics
router.get('/usage', authenticateToken, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user.userId });
    
    if (!subscription) {
      return res.status(404).json({ message: 'No subscription found' });
    }

    // Reset monthly usage if needed
    await subscription.resetMonthlyUsage();

    const usage = {
      current: subscription.usage,
      limits: subscription.limits,
      plan: subscription.plan,
      status: subscription.status,
      daysRemaining: subscription.daysRemaining
    };

    res.json(usage);
  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json({ message: 'Failed to fetch usage statistics' });
  }
});

// Update subscription preferences
router.put('/preferences', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { discount } = req.body;

    const subscription = await Subscription.findOne({ userId: req.user.userId });
    if (!subscription) {
      return res.status(404).json({ message: 'No subscription found' });
    }

    if (discount) {
      subscription.discount = discount;
    }

    await subscription.save();

    res.json({
      message: 'Subscription preferences updated',
      subscription
    });
  } catch (error) {
    console.error('Error updating subscription preferences:', error);
    res.status(500).json({ message: 'Failed to update preferences' });
  }
});

// Webhook endpoint for Stripe
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await paymentService.handleWebhook(event);
    res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Create payment intent for booking
router.post('/payment-intent', authenticateToken, async (req, res) => {
  try {
    const { bookingId, currency = 'USD' } = req.body;

    if (!bookingId) {
      return res.status(400).json({ message: 'Booking ID is required' });
    }

    const paymentIntent = await paymentService.createBookingPaymentIntent(bookingId, currency);

    res.json(paymentIntent);
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ 
      message: error.message || 'Failed to create payment intent' 
    });
  }
});

// Get payment methods
router.get('/payment-methods', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || !user.stripeCustomerId) {
      return res.json({ paymentMethods: [] });
    }

    const paymentMethods = await paymentService.getPaymentMethods(user.stripeCustomerId);

    res.json({ paymentMethods });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ message: 'Failed to fetch payment methods' });
  }
});

// Create setup intent for adding payment method
router.post('/setup-intent', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    let customerId = user.stripeCustomerId;

    // Create customer if not exists
    if (!customerId) {
      const customer = await paymentService.createCustomer(user);
      customerId = customer.id;
    }

    const setupIntent = await paymentService.createSetupIntent(customerId);

    res.json({
      clientSecret: setupIntent.client_secret,
      customerId
    });
  } catch (error) {
    console.error('Error creating setup intent:', error);
    res.status(500).json({ 
      message: error.message || 'Failed to create setup intent' 
    });
  }
});

// Upgrade/downgrade subscription
router.post('/change-plan', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { newPlan } = req.body;

    if (!['free', 'pro', 'business'].includes(newPlan)) {
      return res.status(400).json({ message: 'Invalid plan' });
    }

    const subscription = await Subscription.findOne({ userId: req.user.userId });
    if (!subscription) {
      return res.status(404).json({ message: 'No subscription found' });
    }

    // Handle downgrade to free
    if (newPlan === 'free') {
      if (subscription.stripeSubscriptionId) {
        await paymentService.cancelSubscription(req.user.userId, false);
      }
      
      subscription.plan = 'free';
      subscription.status = 'active';
      await subscription.save();

      await User.findByIdAndUpdate(req.user.userId, {
        subscriptionPlan: 'free',
        subscriptionStatus: 'active'
      });

      return res.json({
        message: 'Downgraded to free plan',
        subscription
      });
    }

    // For upgrades, this would typically involve Stripe subscription modification
    res.json({
      message: 'Plan change initiated',
      note: 'This would typically involve Stripe subscription modification in production'
    });
  } catch (error) {
    console.error('Error changing plan:', error);
    res.status(500).json({ message: 'Failed to change plan' });
  }
});

// Get subscription analytics for admin
router.get('/analytics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user.userId });
    if (!subscription) {
      return res.status(404).json({ message: 'No subscription found' });
    }

    // Calculate some basic analytics
    const totalInvoices = subscription.invoices.length;
    const totalPaid = subscription.invoices
      .filter(inv => inv.status === 'paid')
      .reduce((sum, inv) => sum + inv.amount, 0);

    const analytics = {
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        daysRemaining: subscription.daysRemaining,
        totalPaid
      },
      usage: subscription.usage,
      limits: subscription.limits,
      billing: {
        totalInvoices,
        totalPaid,
        currency: subscription.pricing.currency,
        nextBillingDate: subscription.currentPeriodEnd
      }
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching subscription analytics:', error);
    res.status(500).json({ message: 'Failed to fetch analytics' });
  }
});

export default router;