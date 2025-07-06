import Stripe from 'stripe';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import Booking from '../models/Booking.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

class PaymentService {
  // Create Stripe customer
  async createCustomer(user) {
    try {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user._id.toString(),
          businessName: user.businessName
        }
      });

      await User.findByIdAndUpdate(user._id, {
        stripeCustomerId: customer.id
      });

      return customer;
    } catch (error) {
      console.error('Error creating Stripe customer:', error);
      throw new Error('Failed to create payment customer');
    }
  }

  // Create subscription
  async createSubscription(userId, planId, paymentMethodId, currency = 'USD') {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await this.createCustomer(user);
        customerId = customer.id;
      }

      // Attach payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      // Set as default payment method
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      // Get plan pricing
      const planPricing = Subscription.getPlanPricing(planId, currency);
      if (!planPricing) throw new Error('Invalid plan');

      // Create subscription
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `BizBoard ${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan`,
            },
            unit_amount: planPricing.monthly * 100, // Stripe expects cents
            recurring: {
              interval: 'month',
            },
          },
        }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          userId: userId.toString(),
          plan: planId
        }
      });

      // Update or create subscription record
      await Subscription.findOneAndUpdate(
        { userId },
        {
          plan: planId,
          status: 'active',
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          pricing: {
            amount: planPricing.monthly,
            currency,
            interval: 'month'
          }
        },
        { upsert: true, new: true }
      );

      // Update user subscription details
      await User.findByIdAndUpdate(userId, {
        subscriptionPlan: planId,
        subscriptionStatus: 'active',
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id
      });

      return {
        subscriptionId: subscription.id,
        clientSecret: subscription.latest_invoice.payment_intent.client_secret,
        status: subscription.status
      };
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw new Error('Failed to create subscription');
    }
  }

  // Cancel subscription
  async cancelSubscription(userId, immediate = false) {
    try {
      const subscription = await Subscription.findOne({ userId });
      if (!subscription) throw new Error('Subscription not found');

      if (immediate) {
        await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
      } else {
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true
        });
        subscription.cancelAtPeriodEnd = true;
      }

      await subscription.save();

      await User.findByIdAndUpdate(userId, {
        subscriptionStatus: immediate ? 'cancelled' : 'active'
      });

      return subscription;
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw new Error('Failed to cancel subscription');
    }
  }

  // Create payment intent for booking invoice
  async createBookingPaymentIntent(bookingId, currency = 'USD') {
    try {
      const booking = await Booking.findById(bookingId).populate('userId customerId');
      if (!booking) throw new Error('Booking not found');

      const user = booking.userId;
      let customerId = user.stripeCustomerId;

      if (!customerId) {
        const customer = await this.createCustomer(user);
        customerId = customer.id;
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: booking.totalAmount * 100, // Convert to cents
        currency: currency.toLowerCase(),
        customer: customerId,
        metadata: {
          bookingId: bookingId.toString(),
          customerId: booking.customerId._id.toString(),
          serviceProvider: user.businessName
        },
        description: `Payment for booking on ${new Date(booking.date).toLocaleDateString()}`
      });

      // Update booking with payment intent
      booking.stripePaymentIntentId = paymentIntent.id;
      booking.paymentMethod = 'stripe';
      await booking.save();

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      };
    } catch (error) {
      console.error('Error creating payment intent:', error);
      throw new Error('Failed to create payment intent');
    }
  }

  // Handle webhook events
  async handleWebhook(event) {
    try {
      switch (event.type) {
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object);
          break;
        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object);
          break;
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      // Log webhook event
      const userId = event.data.object.metadata?.userId;
      if (userId) {
        await Subscription.findOneAndUpdate(
          { userId },
          {
            $push: {
              webhookEvents: {
                eventType: event.type,
                stripeEventId: event.id,
                processed: true
              }
            }
          }
        );
      }
    } catch (error) {
      console.error('Error handling webhook:', error);
      throw error;
    }
  }

  async handleSubscriptionUpdated(subscription) {
    const userId = subscription.metadata.userId;
    if (!userId) return;

    await Subscription.findOneAndUpdate(
      { userId },
      {
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      }
    );

    await User.findByIdAndUpdate(userId, {
      subscriptionStatus: subscription.status
    });
  }

  async handleSubscriptionDeleted(subscription) {
    const userId = subscription.metadata.userId;
    if (!userId) return;

    await Subscription.findOneAndUpdate(
      { userId },
      {
        status: 'cancelled',
        cancelledAt: new Date()
      }
    );

    await User.findByIdAndUpdate(userId, {
      subscriptionStatus: 'cancelled',
      subscriptionPlan: 'free'
    });
  }

  async handleInvoicePaymentSucceeded(invoice) {
    const customerId = invoice.customer;
    const user = await User.findOne({ stripeCustomerId: customerId });
    if (!user) return;

    await Subscription.findOneAndUpdate(
      { userId: user._id },
      {
        $push: {
          invoices: {
            stripeInvoiceId: invoice.id,
            amount: invoice.amount_paid / 100,
            currency: invoice.currency,
            status: 'paid',
            paidAt: new Date(invoice.status_transitions.paid_at * 1000)
          }
        }
      }
    );
  }

  async handleInvoicePaymentFailed(invoice) {
    const customerId = invoice.customer;
    const user = await User.findOne({ stripeCustomerId: customerId });
    if (!user) return;

    await Subscription.findOneAndUpdate(
      { userId: user._id },
      { status: 'past_due' }
    );

    await User.findByIdAndUpdate(user._id, {
      subscriptionStatus: 'past_due'
    });
  }

  async handlePaymentIntentSucceeded(paymentIntent) {
    const bookingId = paymentIntent.metadata.bookingId;
    if (!bookingId) return;

    await Booking.findByIdAndUpdate(bookingId, {
      paymentStatus: 'paid',
      paymentMethod: 'stripe'
    });
  }

  // Get payment methods for customer
  async getPaymentMethods(customerId) {
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });
      return paymentMethods.data;
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      throw new Error('Failed to fetch payment methods');
    }
  }

  // Create setup intent for saving payment method
  async createSetupIntent(customerId) {
    try {
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
      });
      return setupIntent;
    } catch (error) {
      console.error('Error creating setup intent:', error);
      throw new Error('Failed to create setup intent');
    }
  }

  // Get subscription usage and billing info
  async getSubscriptionInfo(userId) {
    try {
      const subscription = await Subscription.findOne({ userId });
      if (!subscription) return null;

      let stripeSubscription = null;
      if (subscription.stripeSubscriptionId) {
        stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      }

      return {
        ...subscription.toObject(),
        stripeData: stripeSubscription
      };
    } catch (error) {
      console.error('Error fetching subscription info:', error);
      throw new Error('Failed to fetch subscription info');
    }
  }
}

export default new PaymentService();