import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { handleGoogleOAuthCallback } from '../utils/oauth';

const OAuthCallback = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setToken, setUser } = useAuth();

  useEffect(() => {
    const processOAuthCallback = async () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');

      if (error) {
        setStatus('error');
        setError('OAuth authentication was cancelled or failed');
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      if (!code) {
        setStatus('error');
        setError('No authorization code received');
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      try {
        const result = await handleGoogleOAuthCallback(code);
        
        if (result.success) {
          // Store auth data
          localStorage.setItem('token', result.token);
          setToken(result.token);
          setUser(result.user);
          
          setStatus('success');
          setTimeout(() => navigate('/dashboard'), 1500);
        } else {
          setStatus('error');
          setError(result.error);
          setTimeout(() => navigate('/login'), 3000);
        }
      } catch (error) {
        setStatus('error');
        setError('Authentication failed. Please try again.');
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    processOAuthCallback();
  }, [searchParams, navigate, setToken, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-md w-full text-center space-y-6">
        {status === 'processing' && (
          <>
            <div className="flex justify-center">
              <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Completing Authentication
              </h2>
              <p className="text-gray-600">
                Please wait while we process your Google authentication...
              </p>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="flex justify-center">
              <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Authentication Successful!
              </h2>
              <p className="text-gray-600">
                Redirecting you to your dashboard...
              </p>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex justify-center">
              <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Authentication Failed
              </h2>
              <p className="text-red-600 mb-4">
                {error}
              </p>
              <p className="text-gray-600">
                Redirecting you back to login...
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OAuthCallback;