import React, { useState, useEffect } from 'react';
import { Plus, Calendar, Clock, User, Phone, MapPin, Filter, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';

const Bookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    date: ''
  });
  const { t } = useTranslation();

  useEffect(() => {
    fetchBookings();
  }, [filters]);

  const fetchBookings = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.date) params.append('date', filters.date);
      
      const response = await api.get(`/bookings?${params}`);
      setBookings(response.data.bookings);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  };

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
      case 'in-progress':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    return t(`bookings.status.${status}`) || status;
  };

  const handleStatusUpdate = async (bookingId, newStatus) => {
    setUpdating(true);
    try {
      await api.put(`/bookings/${bookingId}`, { status: newStatus });
      
      // Update the booking in the local state
      setBookings(prevBookings => 
        prevBookings.map(booking => 
          booking._id === bookingId 
            ? { ...booking, status: newStatus }
            : booking
        )
      );
      
      // Update selected booking if it's the one being updated
      if (selectedBooking && selectedBooking._id === bookingId) {
        setSelectedBooking(prev => ({ ...prev, status: newStatus }));
      }
      
      // Show success message
      alert(t('messages.success.updated'));
    } catch (error) {
      console.error('Error updating booking:', error);
      alert(t('messages.error.general'));
    } finally {
      setUpdating(false);
    }
  };

  const handleBookingClick = (booking) => {
    setSelectedBooking(booking);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedBooking(null);
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
        <h1 className="text-2xl font-bold text-gray-900">{t('bookings.title')}</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>{t('bookings.newBooking')}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">{t('common.filter')} by:</span>
          </div>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All {t('common.status')}</option>
            <option value="pending">{t('bookings.status.pending')}</option>
            <option value="confirmed">{t('bookings.status.confirmed')}</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">{t('bookings.status.completed')}</option>
            <option value="cancelled">{t('bookings.status.cancelled')}</option>
          </select>
          <input
            type="date"
            value={filters.date}
            onChange={(e) => setFilters({ ...filters, date: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Bookings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {bookings.map((booking) => (
          <div
            key={booking._id}
            className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow duration-200 cursor-pointer"
            onClick={() => handleBookingClick(booking)}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-2">
                <User className="h-5 w-5 text-gray-400" />
                <h3 className="font-semibold text-gray-900">{booking.customerId?.name}</h3>
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(booking.status)}`}>
                {booking.localizedStatus || getStatusText(booking.status)}
              </span>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Calendar className="h-4 w-4" />
                <span>{new Date(booking.date).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Clock className="h-4 w-4" />
                <span>{booking.time}</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Phone className="h-4 w-4" />
                <span>{booking.customerId?.phone}</span>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm text-gray-600 mb-2">{booking.serviceId?.name}</p>
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-gray-900">${booking.totalAmount}</span>
                <span className="text-sm text-gray-500">{booking.duration} {t('services.minutes')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {bookings.length === 0 && (
        <div className="text-center py-12">
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">{t('bookings.noBookings')}</p>
        </div>
      )}

      {/* Booking Detail Modal */}
      {showModal && selectedBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{t('bookings.bookingDetails')}</h3>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm font-medium text-gray-700">{t('bookings.customer')}</label>
                <p className="text-gray-900">{selectedBooking.customerId?.name}</p>
                <p className="text-sm text-gray-600">{selectedBooking.customerId?.email}</p>
                <p className="text-sm text-gray-600">{selectedBooking.customerId?.phone}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">{t('bookings.serviceType')}</label>
                <p className="text-gray-900">{selectedBooking.serviceId?.name}</p>
                <p className="text-sm text-gray-600">{t('bookings.duration')}: {selectedBooking.duration} {t('services.minutes')}</p>
                <p className="text-sm text-gray-600">{t('common.price')}: ${selectedBooking.totalAmount}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">{t('bookings.dateTime')}</label>
                <p className="text-gray-900">
                  {new Date(selectedBooking.date).toLocaleDateString()} at {selectedBooking.time}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">Current {t('common.status')}</label>
                <div className="mt-1">
                  <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(selectedBooking.status)}`}>
                    {selectedBooking.localizedStatus || getStatusText(selectedBooking.status)}
                  </span>
                </div>
              </div>

              {selectedBooking.notes && (
                <div>
                  <label className="text-sm font-medium text-gray-700">{t('bookings.notes')}</label>
                  <p className="text-gray-900">{selectedBooking.notes}</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700">Payment {t('common.status')}</label>
                <p className="text-gray-900 capitalize">{selectedBooking.paymentStatus || 'pending'}</p>
              </div>
            </div>

            {/* Status Update Buttons */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">{t('common.update')} {t('common.status')}:</p>
              
              <div className="grid grid-cols-2 gap-3">
                {selectedBooking.status !== 'confirmed' && (
                  <button
                    onClick={() => handleStatusUpdate(selectedBooking._id, 'confirmed')}
                    disabled={updating}
                    className="bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {updating ? 'Updating...' : t('bookings.confirmBooking')}
                  </button>
                )}
                
                {selectedBooking.status !== 'in-progress' && selectedBooking.status !== 'completed' && (
                  <button
                    onClick={() => handleStatusUpdate(selectedBooking._id, 'in-progress')}
                    disabled={updating}
                    className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {updating ? 'Updating...' : 'Start'}
                  </button>
                )}
                
                {selectedBooking.status !== 'completed' && (
                  <button
                    onClick={() => handleStatusUpdate(selectedBooking._id, 'completed')}
                    disabled={updating}
                    className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {updating ? 'Updating...' : 'Complete'}
                  </button>
                )}
                
                {selectedBooking.status !== 'cancelled' && selectedBooking.status !== 'completed' && (
                  <button
                    onClick={() => handleStatusUpdate(selectedBooking._id, 'cancelled')}
                    disabled={updating}
                    className="bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {updating ? 'Updating...' : t('bookings.cancelBooking')}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t">
              <button
                onClick={closeModal}
                className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors duration-200"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bookings;