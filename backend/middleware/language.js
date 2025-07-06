// Language middleware for detecting user language and providing translations

const translations = {
  en: {
    bookingStatus: {
      pending: 'Pending',
      confirmed: 'Confirmed',
      completed: 'Completed',
      cancelled: 'Cancelled'
    },
    messages: {
      success: {
        bookingCreated: 'Booking created successfully',
        bookingUpdated: 'Booking updated successfully',
        bookingDeleted: 'Booking deleted successfully',
        customerCreated: 'Customer created successfully',
        serviceCreated: 'Service created successfully',
        updated: 'Updated successfully',
        created: 'Created successfully',
        deleted: 'Deleted successfully',
        saved: 'Saved successfully'
      },
      error: {
        notFound: 'Not found',
        unauthorized: 'Unauthorized access',
        invalidCredentials: 'Invalid credentials',
        conflictingBooking: 'Time slot conflicts with existing booking',
        customerNotFound: 'Customer or Service not found',
        bookingNotFound: 'Booking not found',
        customerExists: 'Customer with this email already exists',
        general: 'An error occurred'
      }
    }
  },
  am: {
    bookingStatus: {
      pending: 'በመጠባበቅ ላይ',
      confirmed: 'ተረጋግጦል',
      completed: 'ተጠናቅቋል',
      cancelled: 'ተሰርዟል'
    },
    messages: {
      success: {
        bookingCreated: 'ቦታ ማስያዝ በተሳካ ሁኔታ ተፈጥሯል',
        bookingUpdated: 'ቦታ ማስያዝ በተሳካ ሁኔታ ተሻሽሏል',
        bookingDeleted: 'ቦታ ማስያዝ በተሳካ ሁኔታ ተሰርዟል',
        customerCreated: 'ደንበኛ በተሳካ ሁኔታ ተፈጥሯል',
        serviceCreated: 'አገልግሎት በተሳካ ሁኔታ ተፈጥሯል',
        updated: 'በተሳካ ሁኔታ ተሻሽሏል',
        created: 'በተሳካ ሁኔታ ተፈጥሯል',
        deleted: 'በተሳካ ሁኔታ ተሰርዟል',
        saved: 'በተሳካ ሁኔታ ተስቶል'
      },
      error: {
        notFound: 'አልተገኘም',
        unauthorized: 'ያልተፈቀደ መዳረሻ',
        invalidCredentials: 'ልክ ያልሆነ ማረጋገጫ',
        conflictingBooking: 'የጊዜ ክፍተት ከነባር ቦታ ማስያዝ ጋር ይጋጫል',
        customerNotFound: 'ደንበኛ ወይም አገልግሎት አልተገኘም',
        bookingNotFound: 'ቦታ ማስያዝ አልተገኘም',
        customerExists: 'በዚህ ኢሜይል ደንበኛ አስቀድሞ አለ',
        general: 'ችግር ተፈጥሯል'
      }
    }
  },
  or: {
    bookingStatus: {
      pending: 'Eeguu keessa',
      confirmed: 'Mirkaneeffame',
      completed: 'Xumurameera',
      cancelled: 'Haqameera'
    },
    messages: {
      success: {
        bookingCreated: 'Qabannoon milkaaʼinaan uumameera',
        bookingUpdated: 'Qabannoon milkaaʼinaan fooyaameera',
        bookingDeleted: 'Qabannoon milkaaʼinaan haqameera',
        customerCreated: 'Maamilaan milkaaʼinaan uumameera',
        serviceCreated: 'Tajaajilon milkaaʼinaan uumameera',
        updated: 'Milkaaʼinaan fooyaaʼame',
        created: 'Milkaaʼinaan uumame',
        deleted: 'Milkaaʼinaan haqame',
        saved: 'Milkaaʼinaan olkaaʼame'
      },
      error: {
        notFound: 'Hin argamne',
        unauthorized: 'Eeyyama hin qabnu',
        invalidCredentials: 'Mirkaneessaa sirrii miti',
        conflictingBooking: 'Yeroon qabannoo biroo wajjin wal dhaba',
        customerNotFound: 'Maamilaan ykn tajaajilaan hin argamne',
        bookingNotFound: 'Qabannoon hin argamne',
        customerExists: 'Maamilaan imeelii kanaan duraanii jira',
        general: 'Dogoggorri uumameera'
      }
    }
  }
};

// Language detection middleware
export const languageMiddleware = (req, res, next) => {
  // Get language from Accept-Language header or default to 'en'
  const acceptLanguage = req.headers['accept-language'] || 'en';
  
  // Extract the language code (first 2 characters)
  const langCode = acceptLanguage.split('-')[0].toLowerCase();
  
  // Set the language, default to 'en' if not supported
  req.language = ['en', 'am', 'or'].includes(langCode) ? langCode : 'en';
  
  // Add translation helper to request object
  req.t = (key) => {
    const keys = key.split('.');
    let value = translations[req.language];
    
    for (const k of keys) {
      value = value?.[k];
    }
    
    return value || key; // Return the key if translation not found
  };
  
  // Add helper to translate booking status
  req.translateStatus = (status) => {
    return req.t(`bookingStatus.${status}`) || status;
  };
  
  next();
};

export default languageMiddleware;