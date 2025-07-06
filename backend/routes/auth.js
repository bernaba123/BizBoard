import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import auth from '../middleware/auth.js';
import GoogleAuthService from '../services/googleAuthService.js';

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, businessName, businessType, phone, address } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Create new user
    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      businessName,
      businessType,
      phone,
      address
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        businessName: user.businessName,
        businessType: user.businessType,
        language: user.language
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        businessName: user.businessName,
        businessType: user.businessType,
        language: user.language,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Test OAuth configuration endpoint
router.get('/google/test', (req, res) => {
  res.json({
    configured: {
      clientId: !!process.env.GOOGLE_CLIENT_ID,
      clientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: !!process.env.GOOGLE_REDIRECT_URI
    },
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    message: process.env.GOOGLE_CLIENT_ID ? 'OAuth configured' : 'OAuth not configured - check environment variables'
  });
});

// Google OAuth - Get auth URL
router.get('/google', (req, res) => {
  try {
    // Check if required env vars are set
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
      return res.status(500).json({ 
        message: 'Google OAuth not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in your environment variables.',
        configured: {
          clientId: !!process.env.GOOGLE_CLIENT_ID,
          clientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
          redirectUri: !!process.env.GOOGLE_REDIRECT_URI
        }
      });
    }

    // Debug logging for OAuth configuration
    console.log('OAuth Configuration Check:');
    console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Missing');
    console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Missing');
    console.log('GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI);
    
    const authUrl = GoogleAuthService.getAuthUrl();
    console.log('Generated OAuth URL:', authUrl);
    res.json({ authUrl });
  } catch (error) {
    console.error('Google auth URL error:', error);
    res.status(500).json({ message: 'Failed to generate Google auth URL' });
  }
});

// Google OAuth - Handle callback
router.post('/google/callback', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ message: 'Authorization code is required' });
    }

    // Exchange code for tokens
    const tokens = await GoogleAuthService.getTokens(code);
    
    // Get user info from Google
    const googleUser = await GoogleAuthService.getUserInfo(tokens.access_token);

    // Check if user exists
    let user = await User.findOne({
      $or: [
        { googleId: googleUser.googleId },
        { email: googleUser.email }
      ]
    });

    if (user) {
      // Update existing user with Google info if not set
      if (!user.googleId) {
        user.googleId = googleUser.googleId;
        user.profilePicture = googleUser.profilePicture;
        await user.save();
      }
      user.lastLogin = new Date();
      await user.save();
    } else {
      // Create new user from Google info
      user = new User({
        googleId: googleUser.googleId,
        name: googleUser.name,
        email: googleUser.email,
        businessName: `${googleUser.name}'s Business`,
        businessType: 'other',
        profilePicture: googleUser.profilePicture
      });
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Google authentication successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        businessName: user.businessName,
        businessType: user.businessType,
        language: user.language,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).json({ message: 'Google authentication failed' });
  }
});

// Get current user profile
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        businessName: user.businessName,
        businessType: user.businessType,
        phone: user.phone,
        address: user.address,
        language: user.language,
        profilePicture: user.profilePicture,
        businessHours: user.businessHours,
        timezone: user.timezone
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to fetch user profile' });
  }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const {
      name,
      businessName,
      businessType,
      phone,
      address,
      language,
      businessHours,
      timezone
    } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update fields if provided
    if (name) user.name = name;
    if (businessName) user.businessName = businessName;
    if (businessType) user.businessType = businessType;
    if (phone) user.phone = phone;
    if (address) user.address = address;
    if (language) user.language = language;
    if (businessHours) user.businessHours = businessHours;
    if (timezone) user.timezone = timezone;

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        businessName: user.businessName,
        businessType: user.businessType,
        phone: user.phone,
        address: user.address,
        language: user.language,
        businessHours: user.businessHours,
        timezone: user.timezone
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// Change password
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.userId).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user has a password (might be Google OAuth only)
    if (!user.password) {
      return res.status(400).json({ 
        message: 'This account uses Google authentication. Cannot change password.' 
      });
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
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
});

// Logout (optional - mainly for revoking Google tokens if needed)
router.post('/logout', auth, async (req, res) => {
  try {
    // For Google OAuth users, we could revoke tokens here
    // For now, just send success response
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Failed to logout' });
  }
});

export default router;