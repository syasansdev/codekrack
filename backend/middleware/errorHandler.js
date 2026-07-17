// backend/middleware/errorHandler.js
import logger from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
  logger.error('Error handling middleware caught error:', err);
  
  // Default error status and message
  let statusCode = 500;
  let message = 'Internal server error';
  
  // Customize based on error type
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized access';
  } else if (err.code === 'auth/id-token-expired') {
    statusCode = 401;
    message = 'Token expired';
  } else if (err.code === 'auth/id-token-revoked') {
    statusCode = 401;
    message = 'Token revoked';
  }
  
  // Send error response
  res.status(statusCode).json({
    error: message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

export default errorHandler;