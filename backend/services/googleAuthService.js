import { OAuth2Client } from 'google-auth-library';

class GoogleAuthService {
  constructor() {
    this.client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  // Generate Google OAuth URL
  getAuthUrl() {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    return this.client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      redirect_uri: process.env.GOOGLE_REDIRECT_URI
    });
  }

  // Verify Google ID token
  async verifyIdToken(token) {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      
      const payload = ticket.getPayload();
      
      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        profilePicture: payload.picture,
        emailVerified: payload.email_verified
      };
    } catch (error) {
      throw new Error('Invalid Google token');
    }
  }

  // Exchange authorization code for tokens
  async getTokens(code) {
    try {
      const { tokens } = await this.client.getToken(code);
      return tokens;
    } catch (error) {
      throw new Error('Failed to exchange code for tokens');
    }
  }

  // Get user info from Google
  async getUserInfo(accessToken) {
    try {
      const userInfoResponse = await fetch(
        `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`
      );
      
      if (!userInfoResponse.ok) {
        throw new Error('Failed to fetch user info');
      }
      
      const userInfo = await userInfoResponse.json();
      
      return {
        googleId: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        profilePicture: userInfo.picture
      };
    } catch (error) {
      throw new Error('Failed to get user info from Google');
    }
  }

  // Revoke Google tokens (for logout)
  async revokeToken(token) {
    try {
      await this.client.revokeToken(token);
      return true;
    } catch (error) {
      console.error('Error revoking token:', error);
      return false;
    }
  }
}

export default new GoogleAuthService();