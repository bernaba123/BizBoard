import User from '../models/User.js';
import Subscription from '../models/Subscription.js';

// Role-based access control middleware
export const checkRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.userId).select('+role +permissions');
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      // Check if user role is allowed
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ 
          message: 'Access denied. Insufficient role permissions.',
          requiredRoles: allowedRoles,
          userRole: user.role
        });
      }

      req.user.role = user.role;
      req.user.permissions = user.permissions;
      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({ message: 'Server error during role verification' });
    }
  };
};

// Permission-based access control
export const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.userId).select('+permissions');
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      // Check if user has required permission
      if (!user.permissions.includes(requiredPermission)) {
        return res.status(403).json({ 
          message: 'Access denied. Insufficient permissions.',
          requiredPermission,
          userPermissions: user.permissions
        });
      }

      req.user.permissions = user.permissions;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ message: 'Server error during permission verification' });
    }
  };
};

// Resource-based access control
export const checkResourceAccess = (resource, action = 'read') => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.userId).select('+role +permissions');
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      // Check if user can access the resource
      if (!user.canAccess(resource, action)) {
        return res.status(403).json({ 
          message: `Access denied. Cannot ${action} ${resource}.`,
          userRole: user.role
        });
      }

      req.user.role = user.role;
      req.user.permissions = user.permissions;
      next();
    } catch (error) {
      console.error('Resource access check error:', error);
      res.status(500).json({ message: 'Server error during resource access verification' });
    }
  };
};

// Owner access control (for assistants)
export const checkOwnerAccess = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('+role +ownerId');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // If assistant, can only access their owner's data
    if (user.role === 'assistant') {
      const ownerId = user.ownerId;
      
      // Check if the requested resource belongs to the owner
      const requestedUserId = req.params.userId || req.body.userId || req.query.userId;
      if (requestedUserId && requestedUserId !== ownerId.toString()) {
        return res.status(403).json({ 
          message: 'Access denied. Can only access owner\'s data.' 
        });
      }

      // Set the effective userId to the owner's ID for data filtering
      req.effectiveUserId = ownerId;
    } else {
      // Admin can access their own data
      req.effectiveUserId = user._id;
    }

    req.user.role = user.role;
    next();
  } catch (error) {
    console.error('Owner access check error:', error);
    res.status(500).json({ message: 'Server error during owner access verification' });
  }
};

// Subscription feature access control
export const checkFeatureAccess = (feature) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      const subscription = await Subscription.findOne({ userId: user._id });
      if (!subscription) {
        return res.status(403).json({ 
          message: 'No active subscription found.',
          feature,
          action: 'upgrade_required'
        });
      }

      // Check if feature is available in current plan
      if (!subscription.hasFeature(feature)) {
        return res.status(403).json({ 
          message: `Feature not available in ${subscription.plan} plan.`,
          feature,
          currentPlan: subscription.plan,
          action: 'upgrade_required'
        });
      }

      // Check subscription status
      if (!['active', 'trial'].includes(subscription.status)) {
        return res.status(403).json({ 
          message: 'Subscription is not active.',
          status: subscription.status,
          action: 'billing_required'
        });
      }

      req.subscription = subscription;
      next();
    } catch (error) {
      console.error('Feature access check error:', error);
      res.status(500).json({ message: 'Server error during feature access verification' });
    }
  };
};

// Usage limit check
export const checkUsageLimit = (limitType) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      const subscription = await Subscription.findOne({ userId: user._id });
      if (!subscription) {
        return res.status(403).json({ 
          message: 'No subscription found.',
          action: 'subscription_required'
        });
      }

      // Reset monthly usage if needed
      await subscription.resetMonthlyUsage();

      let canCreate = false;
      let currentUsage = 0;
      let limit = 0;

      switch (limitType) {
        case 'booking':
          canCreate = subscription.canCreateBooking();
          currentUsage = subscription.usage.bookingsThisMonth;
          limit = subscription.limits.maxBookingsPerMonth;
          break;
        case 'service':
          canCreate = subscription.canCreateService();
          currentUsage = subscription.usage.servicesCount;
          limit = subscription.limits.maxServices;
          break;
        case 'assistant':
          canCreate = subscription.canCreateAssistant();
          currentUsage = subscription.usage.assistantsCount;
          limit = subscription.limits.maxAssistants;
          break;
        default:
          canCreate = true;
      }

      if (!canCreate) {
        return res.status(403).json({ 
          message: `${limitType} limit exceeded for ${subscription.plan} plan.`,
          currentUsage,
          limit: limit === -1 ? 'unlimited' : limit,
          action: 'upgrade_required'
        });
      }

      req.subscription = subscription;
      next();
    } catch (error) {
      console.error('Usage limit check error:', error);
      res.status(500).json({ message: 'Server error during usage limit verification' });
    }
  };
};

// Admin-only access
export const requireAdmin = checkRole(['admin']);

// Assistant or higher access
export const requireAssistantOrHigher = checkRole(['admin', 'assistant']);

// Billing management access
export const requireBillingAccess = checkPermission('manage_billing');

// User management access
export const requireUserManagement = checkPermission('manage_users');

// Export access control utilities
export const rbacUtils = {
  // Check if user can manage other users
  canManageUsers: (userRole) => {
    return userRole === 'admin';
  },

  // Check if user can access billing
  canAccessBilling: (userPermissions) => {
    return userPermissions.includes('manage_billing');
  },

  // Check if user can delete resources
  canDelete: (userPermissions) => {
    return userPermissions.includes('delete');
  },

  // Get accessible resources for user role
  getAccessibleResources: (userRole) => {
    switch (userRole) {
      case 'admin':
        return ['bookings', 'customers', 'services', 'payments', 'analytics', 'users', 'billing', 'settings'];
      case 'assistant':
        return ['bookings', 'customers', 'services', 'analytics'];
      default:
        return [];
    }
  },

  // Get allowed actions for user role
  getAllowedActions: (userRole, resource) => {
    if (userRole === 'admin') {
      return ['read', 'write', 'delete'];
    }
    
    if (userRole === 'assistant') {
      const restrictedResources = ['users', 'billing', 'settings'];
      if (restrictedResources.includes(resource)) {
        return [];
      }
      return ['read', 'write'];
    }
    
    return [];
  }
};

// Middleware to add RBAC context to request
export const addRbacContext = async (req, res, next) => {
  try {
    if (req.user && req.user.userId) {
      const user = await User.findById(req.user.userId).select('+role +permissions +ownerId');
      if (user) {
        req.rbac = {
          role: user.role,
          permissions: user.permissions,
          ownerId: user.ownerId,
          canManageUsers: rbacUtils.canManageUsers(user.role),
          canAccessBilling: rbacUtils.canAccessBilling(user.permissions),
          canDelete: rbacUtils.canDelete(user.permissions),
          accessibleResources: rbacUtils.getAccessibleResources(user.role)
        };
      }
    }
    next();
  } catch (error) {
    console.error('RBAC context error:', error);
    next(); // Continue without RBAC context
  }
};