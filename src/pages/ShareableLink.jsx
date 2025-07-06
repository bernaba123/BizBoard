import React, { useState } from 'react';
import { Copy, Share2, ExternalLink, QrCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

const ShareableLink = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  
  const businessUrl = `${window.location.origin}/business/${user?.id}`;
  const bookingUrl = `${window.location.origin}/book/${user?.id}`;

  const copyToClipboard = (url) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">{t('share.title')}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Business Profile Link */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <Share2 className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Business Profile</h2>
          </div>
          
          <p className="text-gray-600 mb-4">
            Share your business profile with potential customers. They can view your services and contact information.
          </p>

          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-600 mb-2">Your Business Profile URL:</p>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={businessUrl}
                readOnly
                className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={() => copyToClipboard(businessUrl)}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex space-x-3">
            <a
              href={businessUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors duration-200 flex items-center justify-center space-x-2"
            >
              <ExternalLink className="h-4 w-4" />
              <span>{t('common.view')}</span>
            </a>
            <button
              onClick={() => copyToClipboard(businessUrl)}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center space-x-2"
            >
              <Copy className="h-4 w-4" />
              <span>{copied ? t('share.linkCopied').split('!')[0] + '!' : t('share.copyLink')}</span>
            </button>
          </div>
        </div>

        {/* Direct Booking Link */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="bg-green-100 p-3 rounded-full">
              <QrCode className="h-6 w-6 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{t('share.publicBooking')}</h2>
          </div>
          
          <p className="text-gray-600 mb-4">
            Direct link for customers to book your services immediately. Perfect for social media and marketing.
          </p>

          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-600 mb-2">Your Booking URL:</p>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={bookingUrl}
                readOnly
                className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={() => copyToClipboard(bookingUrl)}
                className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex space-x-3">
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors duration-200 flex items-center justify-center space-x-2"
            >
              <ExternalLink className="h-4 w-4" />
              <span>{t('common.view')}</span>
            </a>
            <button
              onClick={() => copyToClipboard(bookingUrl)}
              className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center justify-center space-x-2"
            >
              <Copy className="h-4 w-4" />
              <span>{copied ? t('share.linkCopied').split('!')[0] + '!' : t('share.copyLink')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Usage Tips */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">How to Use Your Links</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Business Profile Link</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Add to your website footer</li>
              <li>• Include in email signatures</li>
              <li>• Share on social media profiles</li>
              <li>• Add to business cards</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Direct Booking Link</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Use in social media posts</li>
              <li>• Include in marketing campaigns</li>
              <li>• Add to Google My Business</li>
              <li>• Share via WhatsApp/SMS</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareableLink;