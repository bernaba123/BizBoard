import React, { useState, useEffect } from 'react';
import { Calendar, Users, DollarSign, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';

const Dashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await api.get('/analytics/dashboard');
      setAnalytics(response.data.analytics);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Date formatting based on current language
  const formatDate = (date) => {
    const dateObj = new Date(date);
    const locale = i18n.language === 'am' ? 'am-ET' : i18n.language === 'or' ? 'om-ET' : 'en-US';
    
    try {
      return dateObj.toLocaleDateString(locale, { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (error) {
      // Fallback to English if locale is not supported
      return dateObj.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  };

  const stats = [
    {
      name: t('dashboard.totalBookings'),
      value: analytics?.overview?.totalBookings || 0,
      icon: Calendar,
      color: 'bg-blue-500',
      change: '+12%'
    },
    {
      name: t('dashboard.activeCustomers'),
      value: analytics?.overview?.totalCustomers || 0,
      icon: Users,
      color: 'bg-green-500',
      change: '+5%'
    },
    {
      name: t('dashboard.totalRevenue'),
      value: `$${analytics?.overview?.thisMonthRevenue || 0}`,
      icon: DollarSign,
      color: 'bg-purple-500',
      change: '+18%'
    },
    {
      name: t('dashboard.topServices'),
      value: analytics?.overview?.totalServices || 0,
      icon: TrendingUp,
      color: 'bg-orange-500',
      change: '+2%'
    }
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.dashboard')}</h1>
        <div className="text-sm text-gray-500">
          {formatDate(new Date())}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-green-600 font-medium">{stat.change}</span>
              <span className="text-gray-600 ml-1">{t('common.fromLastMonth')}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Bookings */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.recentBookings')}</h3>
          <div className="space-y-4">
            {analytics?.recentBookings?.length > 0 ? (
              analytics.recentBookings.map((booking) => (
                <div key={booking._id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-100 p-2 rounded-full">
                      <Calendar className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{booking.customerId?.name}</p>
                      <p className="text-sm text-gray-600">{booking.serviceId?.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(booking.originalStatus || booking.status)}`}>
                      {booking.localizedStatus || booking.status}
                    </span>
                    <p className="text-sm text-gray-600 mt-1">
                      {new Date(booking.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">{t('dashboard.noRecentBookings')}</p>
            )}
          </div>
        </div>

        {/* Booking Status Distribution */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.bookingStatus')}</h3>
          <div className="space-y-3">
            {analytics?.bookingStatusStats?.map((stat) => (
              <div key={stat._id} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${
                    stat._id === 'confirmed' ? 'bg-green-500' :
                    stat._id === 'pending' ? 'bg-yellow-500' :
                    stat._id === 'completed' ? 'bg-blue-500' :
                    'bg-red-500'
                  }`}></div>
                  <span className="text-sm text-gray-600">
                    {stat.localizedLabel || stat._id}
                  </span>
                </div>
                <span className="text-sm font-medium text-gray-900">{stat.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.quickActions')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="flex items-center space-x-2 p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors duration-200">
            <Calendar className="h-5 w-5 text-blue-600" />
            <span className="text-blue-700 font-medium">{t('dashboard.newBooking')}</span>
          </button>
          <button className="flex items-center space-x-2 p-4 bg-green-50 hover:bg-green-100 rounded-lg transition-colors duration-200">
            <Users className="h-5 w-5 text-green-600" />
            <span className="text-green-700 font-medium">{t('dashboard.addCustomer')}</span>
          </button>
          <button className="flex items-center space-x-2 p-4 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors duration-200">
            <DollarSign className="h-5 w-5 text-purple-600" />
            <span className="text-purple-700 font-medium">{t('dashboard.createInvoice')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;