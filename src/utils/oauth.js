const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const initiateGoogleOAuth = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/google`);
    const data = await response.json();
    
    if (data.authUrl) {
      // Redirect to Google OAuth
      window.location.href = data.authUrl;
    } else {
      throw new Error('Failed to get OAuth URL');
    }
  } catch (error) {
    console.error('OAuth initiation error:', error);
    throw new Error('Failed to initiate Google OAuth');
  }
};

export const handleGoogleOAuthCallback = async (code) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/google/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });

    const data = await response.json();
    
    if (response.ok) {
      return {
        success: true,
        token: data.token,
        user: data.user,
        message: data.message
      };
    } else {
      return {
        success: false,
        error: data.message || 'OAuth callback failed'
      };
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    return {
      success: false,
      error: 'Failed to process OAuth callback'
    };
  }
};