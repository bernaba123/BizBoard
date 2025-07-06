# BizBoard Setup Guide

This guide will help you set up the BizBoard project with the three enhanced features: Google OAuth, Multilingual Support, and Smart Booking Calendar.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- MongoDB (local or cloud)

### 1. Install Dependencies

**Frontend:**
```bash
npm install
```

**Backend:**
```bash
cd backend
npm install
```

### 2. Database Setup

You have two options for MongoDB:

#### Option A: MongoDB Atlas (Recommended - Free)
1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Create a free account and cluster
3. Create a database user
4. Get your connection string
5. Update `backend/.env`:
   ```bash
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/bizboard?retryWrites=true&w=majority
   ```

#### Option B: Local MongoDB
1. Install MongoDB locally:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install mongodb
   
   # macOS (with Homebrew)
   brew install mongodb-community
   
   # Windows
   # Download from https://www.mongodb.com/try/download/community
   ```
2. Start MongoDB:
   ```bash
   # Ubuntu/Debian
   sudo systemctl start mongod
   
   # macOS
   brew services start mongodb-community
   ```
3. Update `backend/.env`:
   ```bash
   MONGODB_URI=mongodb://localhost:27017/bizboard
   ```

### 3. Environment Configuration

Copy the environment file and update it:
```bash
cd backend
cp .env.example .env
```

Update the following in `backend/.env`:

#### Required Settings:
```bash
# Database (use one of the options above)
MONGODB_URI=your-mongodb-connection-string

# JWT Secret (change this!)
JWT_SECRET=your-super-secret-jwt-key-for-production

# Google OAuth (see setup below)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 4. Google OAuth Setup (for Google Login Feature)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Configure OAuth consent screen
6. Add authorized redirect URIs:
   - `http://localhost:5173/auth/google/callback`
   - `http://localhost:3000/auth/google/callback` (if using port 3000)
7. Copy Client ID and Client Secret to your `.env` file

### 5. Start the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

### 6. Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000/api/health

## ✨ Features Overview

### 1. Google OAuth Login 🔐
- Click "Sign in with Google" on login page
- Automatic account creation for new users
- Secure JWT token authentication

### 2. Multilingual Support 🌍
- **English** - Default language
- **Amharic (አማርኛ)** - Ethiopian language
- **Afan Oromo (Afaan Oromoo)** - Ethiopian language
- Language selector in user profile
- Automatic browser language detection

### 3. Smart Booking Calendar 📅
- Drag & drop rescheduling
- Automatic conflict detection
- Available time slot calculation
- Business hours integration
- Calendar and list views

## 🛠️ Development

### Project Structure
```
├── src/                    # Frontend React code (JavaScript)
│   ├── i18n.js            # Internationalization config
│   ├── main.jsx           # Main entry point
│   ├── App.jsx            # Main App component
│   └── ...
├── backend/               # Backend Node.js code
│   ├── models/           # Database models
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   └── middleware/       # Auth middleware
└── README.md
```

### API Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/google` - Get Google OAuth URL
- `POST /api/auth/google/callback` - Handle Google OAuth
- `GET /api/auth/me` - Get current user

#### Bookings (Smart Calendar)
- `GET /api/bookings` - Get bookings (supports calendar view)
- `POST /api/bookings` - Create booking (with conflict detection)
- `PUT /api/bookings/:id/reschedule` - Reschedule booking
- `GET /api/bookings/available-slots/:date` - Get available time slots
- `GET /api/bookings/calendar/view` - Get calendar-optimized data

### Testing the Features

#### Test Google OAuth:
1. Set up Google OAuth credentials
2. Click "Sign in with Google" on login page
3. Complete OAuth flow

#### Test Multilingual Support:
1. Open the application
2. Look for language selector in navigation
3. Switch between English, Amharic, and Afan Oromo
4. Verify interface updates in real-time

#### Test Smart Calendar:
1. Create a few bookings
2. Switch to calendar view
3. Try drag & drop rescheduling
4. Test conflict detection by overlapping times
5. Check available time slots API

## 🐛 Troubleshooting

### MongoDB Connection Issues
```bash
# Check if MongoDB is running
pgrep mongod

# For MongoDB Atlas, verify:
# 1. Correct connection string
# 2. Database user permissions
# 3. IP whitelist (0.0.0.0/0 for development)
```

### Google OAuth Issues
```bash
# Verify in Google Cloud Console:
# 1. OAuth consent screen configured
# 2. Correct redirect URIs
# 3. APIs enabled (Google+ API)
```

### Port Conflicts
```bash
# Change ports in .env files if needed:
# Frontend: Update vite.config.ts
# Backend: Update PORT in .env
```

### i18n Not Loading
```bash
# Reinstall frontend dependencies
npm install

# Check browser console for errors
# Verify i18n.ts file exists and is properly configured
```

## 🚀 Production Deployment

### Environment Variables
Set these in production:
```bash
NODE_ENV=production
JWT_SECRET=secure-random-string-64-characters-minimum
MONGODB_URI=production-mongodb-connection-string
GOOGLE_CLIENT_ID=production-google-client-id
GOOGLE_CLIENT_SECRET=production-google-client-secret
CORS_ORIGIN=https://yourdomain.com
```

### Security Checklist
- [ ] Change JWT_SECRET to a secure random string
- [ ] Use production MongoDB with authentication
- [ ] Configure Google OAuth for production domain
- [ ] Enable HTTPS
- [ ] Set appropriate CORS origins
- [ ] Enable rate limiting in production

## 📞 Support

If you encounter issues:
1. Check this setup guide
2. Verify all environment variables are set
3. Check MongoDB connection
4. Ensure Google OAuth is configured correctly
5. Check browser console for frontend errors
6. Check server logs for backend errors

## 🎯 What's Working

✅ **Google OAuth Authentication** - Complete signup/login flow  
✅ **Multilingual Support** - 3 languages with real-time switching  
✅ **Smart Booking Calendar** - Conflict detection, drag & drop, time slots  
✅ **Full-stack Integration** - React frontend + Node.js backend  
✅ **Modern Tech Stack** - Latest versions of all dependencies  

The application is ready for development and testing of all three enhanced features!