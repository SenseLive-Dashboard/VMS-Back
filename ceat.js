const express = require('express');
const fs = require('fs');
const https = require('https');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const xssClean = require('xss-clean');
const hpp = require('hpp');
const morgan = require('morgan');
require('dotenv').config();

// Load SSL Certificate and Key
const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/senso.senselive.io/privkey.pem'),   // Place your private key here
  cert: fs.readFileSync('/etc/letsencrypt/live/senso.senselive.io/fullchain.pem')  // Place your certificate here
};

const app = express();

// Security Headers
app.use(helmet());

// Enable CORS with restrictions
app.use(cors({
  origin: 'https://ceat-visit.senselive.io', // Change to allowed domain(s)
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser and payload size limit
app.use(express.json({ limit: '100mb' }));

// Data sanitization against XSS
app.use(xssClean());

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Request Logging
app.use(morgan('combined'));

// Rate Limiting - Prevent brute force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Disable 'x-powered-by' header
app.disable('x-powered-by');

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/manager', require('./routes/manager'));
app.use('/api/security', require('./routes/security'));

// Default 404 handler
app.use((req, res, next) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});

// Start HTTPS server
const PORT = process.env.PORT || 3006;
https.createServer(options, app).listen(PORT, () => {
  console.log(`✅ Secure HTTPS Server running on port ${PORT}`);
});
