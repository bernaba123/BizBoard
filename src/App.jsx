import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Bookings from './pages/Bookings';
import Customers from './pages/Customers';
import Services from './pages/Services';
import Payments from './pages/Payments';
import Settings from './pages/Settings';
import ShareableLink from './pages/ShareableLink';
import PublicBooking from './pages/PublicBooking';
import BusinessProfile from './pages/BusinessProfile';
import OAuthCallback from './components/OAuthCallback';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/business/:businessId" element={<BusinessProfile />} />
          <Route path="/book/:businessId" element={<PublicBooking />} />
          
          {/* OAuth Callback Route */}
          <Route path="/auth/google/callback" element={<OAuthCallback />} />
          
          {/* Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Protected Admin Routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="customers" element={<Customers />} />
            <Route path="services" element={<Services />} />
            <Route path="payments" element={<Payments />} />
            <Route path="share" element={<ShareableLink />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;