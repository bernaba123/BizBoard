import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Building, MapPin, Phone, Mail, Clock, Star, Calendar } from 'lucide-react';
import api from '../utils/api';

const BusinessProfile = () => {
  const { businessId } = useParams();
  const [business, setBusiness] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBusinessProfile();
  }, [businessId]);

  const fetchBusinessProfile = async () => {
    try {
      const response = await api.get(`/public/business/${businessId}`);
      setBusiness(response.data.business);
      setServices(response.data.services);
    } catch (error) {
      console.error('Error fetching business profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Business Not Found</h2>
          <p className="text-gray-600">The business you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Hero Section */}
      <div className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="text-center">
            <div className="bg-blue-100 p-6 rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center">
              <Building className="h-12 w-12 text-blue-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">{business.businessName}</h1>
            <p className="text-xl text-gray-600 mb-6 capitalize">{business.businessType} Services</p>
            
            <div className="flex flex-wrap justify-center items-center space-x-6 text-gray-600">
              {business.phone && (
                <div className="flex items-center space-x-2">
                  <Phone className="h-5 w-5" />
                  <span>{business.phone}</span>
                </div>
              )}
              {business.email && (
                <div className="flex items-center space-x-2">
                  <Mail className="h-5 w-5" />
                  <span>{business.email}</span>
                </div>
              )}
              {business.address && (
                <div className="flex items-center space-x-2">
                  <MapPin className="h-5 w-5" />
                  <span>{business.address}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Services Section */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Services</h2>
            <p className="text-gray-600">Professional services tailored to your needs</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service) => (
              <div key={service._id} className="bg-white rounded-xl shadow-sm p-6 hover:shadow-lg transition-shadow duration-200">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-blue-100 p-3 rounded-full">
                    <Building className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">{service.name}</h3>
                </div>
                
                <p className="text-gray-600 mb-4">{service.description}</p>
                
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">{service.duration} minutes</span>
                  </div>
                  <span className="text-2xl font-bold text-blue-600">${service.price}</span>
                </div>

                <Link
                  to={`/book/${businessId}?service=${service._id}`}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center space-x-2"
                >
                  <Calendar className="h-4 w-4" />
                  <span>Book Now</span>
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-xl mb-6 opacity-90">Book your service today and experience professional quality</p>
          <Link
            to={`/book/${businessId}`}
            className="inline-flex items-center space-x-2 bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors duration-200"
          >
            <Calendar className="h-5 w-5" />
            <span>Book a Service</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default BusinessProfile;