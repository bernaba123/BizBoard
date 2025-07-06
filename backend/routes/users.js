import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { 
  requireAdmin, 
  checkOwnerAccess, 
  checkFeatureAccess, 
  checkUsageLimit,
  addRbacContext 
} from '../middleware/rbac.js';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Apply RBAC context to all routes
router.use(addRbacContext);

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get subscription info
    const subscription = await Subscription.findOne({ userId: user._id });

    res.json({
      user,
      subscription: subscription ? {
        plan: subscription.plan,
        status: subscription.status,
        daysRemaining: subscription.daysRemaining
      } : null,
      rbac: req.rbac
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Failed to fetch user profile' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      businessName,
      businessType,
      businessDescription,
      businessAddress,
      businessHours,
      timezone,
      language
    } = req.body;

    const updateData = {};
    
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (businessName) updateData.businessName = businessName;
    if (businessType) updateData.businessType = businessType;
    if (businessDescription) updateData.businessDescription = businessDescription;
    if (businessAddress) updateData.businessAddress = businessAddress;
    if (businessHours) updateData.businessHours = businessHours;
    if (timezone) updateData.timezone = timezone;
    if (language && ['en', 'am', 'sw'].includes(language)) {
      updateData.language = language;
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    if (error.code === 11000) {
      res.status(400).json({ message: 'Email already exists' });
    } else {
      res.status(500).json({ message: 'Failed to update profile' });
    }
  }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: 'Current password and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        message: 'New password must be at least 6 characters long' 
      });
    }

    const user = await User.findById(req.user.userId).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
});

// Get assistants (admin only)
router.get('/assistants', 
  authenticateToken, 
  requireAdmin,
  checkFeatureAccess('rbac'),
  async (req, res) => {
    try {
      const assistants = await User.find({
        ownerId: req.user.userId,
        role: 'assistant'
      }).select('-password');

      const subscription = await Subscription.findOne({ userId: req.user.userId });
      
      res.json({
        assistants,
        limits: {
          current: assistants.length,
          max: subscription?.limits.maxAssistants || 0
        }
      });
    } catch (error) {
      console.error('Error fetching assistants:', error);
      res.status(500).json({ message: 'Failed to fetch assistants' });
    }
  }
);

// Create assistant (admin only)
router.post('/assistants', 
  authenticateToken, 
  requireAdmin,
  checkFeatureAccess('rbac'),
  checkUsageLimit('assistant'),
  async (req, res) => {
    try {
      const { name, email, password, permissions = ['read', 'write'] } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ 
          message: 'Name, email, and password are required' 
        });
      }

      // Get owner's business info
      const owner = await User.findById(req.user.userId);
      if (!owner) {
        return res.status(404).json({ message: 'Owner not found' });
      }

      // Check if email already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists' });
      }

      const assistant = new User({
        name,
        email,
        password,
        role: 'assistant',
        permissions,
        ownerId: req.user.userId,
        businessName: owner.businessName,
        businessType: owner.businessType,
        businessHours: owner.businessHours,
        timezone: owner.timezone,
        language: owner.language
      });

      await assistant.save();

      // Update subscription usage
      if (req.subscription) {
        req.subscription.usage.assistantsCount += 1;
        await req.subscription.save();
      }

      res.status(201).json({
        message: 'Assistant created successfully',
        assistant: assistant.toJSON()
      });
    } catch (error) {
      console.error('Error creating assistant:', error);
      res.status(500).json({ message: 'Failed to create assistant' });
    }
  }
);

// Update assistant (admin only)
router.put('/assistants/:assistantId', 
  authenticateToken, 
  requireAdmin,
  checkFeatureAccess('rbac'),
  async (req, res) => {
    try {
      const { assistantId } = req.params;
      const { name, email, permissions, isActive } = req.body;

      const assistant = await User.findOne({
        _id: assistantId,
        ownerId: req.user.userId,
        role: 'assistant'
      });

      if (!assistant) {
        return res.status(404).json({ message: 'Assistant not found' });
      }

      const updateData = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (permissions && Array.isArray(permissions)) {
        const validPermissions = ['read', 'write'];
        updateData.permissions = permissions.filter(p => validPermissions.includes(p));
      }
      if (typeof isActive === 'boolean') updateData.isActive = isActive;

      const updatedAssistant = await User.findByIdAndUpdate(
        assistantId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      res.json({
        message: 'Assistant updated successfully',
        assistant: updatedAssistant
      });
    } catch (error) {
      console.error('Error updating assistant:', error);
      if (error.code === 11000) {
        res.status(400).json({ message: 'Email already exists' });
      } else {
        res.status(500).json({ message: 'Failed to update assistant' });
      }
    }
  }
);

// Delete assistant (admin only)
router.delete('/assistants/:assistantId', 
  authenticateToken, 
  requireAdmin,
  checkFeatureAccess('rbac'),
  async (req, res) => {
    try {
      const { assistantId } = req.params;

      const assistant = await User.findOneAndDelete({
        _id: assistantId,
        ownerId: req.user.userId,
        role: 'assistant'
      });

      if (!assistant) {
        return res.status(404).json({ message: 'Assistant not found' });
      }

      // Update subscription usage
      const subscription = await Subscription.findOne({ userId: req.user.userId });
      if (subscription) {
        subscription.usage.assistantsCount = Math.max(0, subscription.usage.assistantsCount - 1);
        await subscription.save();
      }

      res.json({
        message: 'Assistant deleted successfully',
        assistantId
      });
    } catch (error) {
      console.error('Error deleting assistant:', error);
      res.status(500).json({ message: 'Failed to delete assistant' });
    }
  }
);

// Get user preferences
router.get('/preferences', authenticateToken, checkOwnerAccess, async (req, res) => {
  try {
    const user = await User.findById(req.effectiveUserId).select(
      'aiPreferences notificationSettings language timezone businessHours'
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      preferences: {
        ai: user.aiPreferences,
        notifications: user.notificationSettings,
        language: user.language,
        timezone: user.timezone,
        businessHours: user.businessHours
      }
    });
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({ message: 'Failed to fetch preferences' });
  }
});

// Update user preferences
router.put('/preferences', authenticateToken, checkOwnerAccess, async (req, res) => {
  try {
    const { ai, notifications, language, timezone, businessHours } = req.body;

    const updateData = {};

    if (ai) {
      if (typeof ai.enableBookingRecommendations === 'boolean') {
        updateData['aiPreferences.enableBookingRecommendations'] = ai.enableBookingRecommendations;
      }
      if (typeof ai.enableSmartScheduling === 'boolean') {
        updateData['aiPreferences.enableSmartScheduling'] = ai.enableSmartScheduling;
      }
      if (ai.preferredLanguage && ['en', 'am', 'sw'].includes(ai.preferredLanguage)) {
        updateData['aiPreferences.preferredLanguage'] = ai.preferredLanguage;
      }
    }

    if (notifications) {
      if (typeof notifications.emailReminders === 'boolean') {
        updateData['notificationSettings.emailReminders'] = notifications.emailReminders;
      }
      if (typeof notifications.smsReminders === 'boolean') {
        updateData['notificationSettings.smsReminders'] = notifications.smsReminders;
      }
      if (typeof notifications.bookingConfirmations === 'boolean') {
        updateData['notificationSettings.bookingConfirmations'] = notifications.bookingConfirmations;
      }
      if (typeof notifications.reminderHoursBefore === 'number') {
        updateData['notificationSettings.reminderHoursBefore'] = notifications.reminderHoursBefore;
      }
    }

    if (language && ['en', 'am', 'sw'].includes(language)) {
      updateData.language = language;
    }

    if (timezone) {
      updateData.timezone = timezone;
    }

    if (businessHours) {
      updateData.businessHours = businessHours;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No valid preferences provided' });
    }

    const user = await User.findByIdAndUpdate(
      req.effectiveUserId,
      { $set: updateData },
      { new: true }
    ).select('aiPreferences notificationSettings language timezone businessHours');

    res.json({
      message: 'Preferences updated successfully',
      preferences: {
        ai: user.aiPreferences,
        notifications: user.notificationSettings,
        language: user.language,
        timezone: user.timezone,
        businessHours: user.businessHours
      }
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ message: 'Failed to update preferences' });
  }
});

// Get RBAC info for current user
router.get('/rbac', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('role permissions ownerId');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let owner = null;
    if (user.ownerId) {
      owner = await User.findById(user.ownerId).select('name businessName email');
    }

    const rbacInfo = {
      role: user.role,
      permissions: user.permissions,
      owner,
      accessibleResources: req.rbac?.accessibleResources || [],
      capabilities: {
        canManageUsers: req.rbac?.canManageUsers || false,
        canAccessBilling: req.rbac?.canAccessBilling || false,
        canDelete: req.rbac?.canDelete || false
      }
    };

    res.json(rbacInfo);
  } catch (error) {
    console.error('Error fetching RBAC info:', error);
    res.status(500).json({ message: 'Failed to fetch RBAC information' });
  }
});

// Update assistant permissions (admin only)
router.put('/assistants/:assistantId/permissions', 
  authenticateToken, 
  requireAdmin,
  checkFeatureAccess('rbac'),
  async (req, res) => {
    try {
      const { assistantId } = req.params;
      const { permissions } = req.body;

      if (!permissions || !Array.isArray(permissions)) {
        return res.status(400).json({ message: 'Permissions array is required' });
      }

      const validPermissions = ['read', 'write'];
      const filteredPermissions = permissions.filter(p => validPermissions.includes(p));

      const assistant = await User.findOneAndUpdate(
        {
          _id: assistantId,
          ownerId: req.user.userId,
          role: 'assistant'
        },
        { permissions: filteredPermissions },
        { new: true }
      ).select('-password');

      if (!assistant) {
        return res.status(404).json({ message: 'Assistant not found' });
      }

      res.json({
        message: 'Assistant permissions updated successfully',
        assistant
      });
    } catch (error) {
      console.error('Error updating assistant permissions:', error);
      res.status(500).json({ message: 'Failed to update assistant permissions' });
    }
  }
);

// Reset assistant password (admin only)
router.post('/assistants/:assistantId/reset-password', 
  authenticateToken, 
  requireAdmin,
  checkFeatureAccess('rbac'),
  async (req, res) => {
    try {
      const { assistantId } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ 
          message: 'New password must be at least 6 characters long' 
        });
      }

      const assistant = await User.findOne({
        _id: assistantId,
        ownerId: req.user.userId,
        role: 'assistant'
      });

      if (!assistant) {
        return res.status(404).json({ message: 'Assistant not found' });
      }

      assistant.password = newPassword;
      await assistant.save();

      res.json({
        message: 'Assistant password reset successfully',
        assistantId
      });
    } catch (error) {
      console.error('Error resetting assistant password:', error);
      res.status(500).json({ message: 'Failed to reset assistant password' });
    }
  }
);

// Get user activity log
router.get('/activity', 
  authenticateToken, 
  checkOwnerAccess,
  async (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;

      // This would typically come from an audit log collection
      // For now, return a placeholder
      const activities = [];

      res.json({
        activities,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: 0
        },
        note: 'Activity logging not fully implemented yet'
      });
    } catch (error) {
      console.error('Error fetching user activity:', error);
      res.status(500).json({ message: 'Failed to fetch user activity' });
    }
  }
);

export default router;