const express = require('express');
const fs = require('fs');
const https = require('https');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const morgan = require('morgan');
const xss = require('xss');
require('dotenv').config();

// Load SSL Certificate and Key
const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/senso.senselive.io/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/senso.senselive.io/fullchain.pem')
};

const app = express();

// Security Headers
app.use(helmet());

// Enable CORS with allowed domain
app.use(cors({
  origin: 'https://ceat-visit.senselive.io',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser with payload limit
app.use(express.json({ limit: '100mb' }));

// XSS protection using maintained xss library
app.use((req, res, next) => {
  const sanitize = (obj) => {
    for (let key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = xss(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitize(obj[key]);
      }
    }
  };
  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  next();
});

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Request Logging
app.use(morgan('combined'));

// Rate Limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
}));

// Disable Express 'x-powered-by'
app.disable('x-powered-by');

// Routes
app.use('/ceat/auth', require('./routes/auth'));
app.use('/ceat/admin', require('./routes/admin'));
app.use('/ceat/manager', require('./routes/manager'));
app.use('/ceat/security', require('./routes/security'));

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});

// Start HTTPS Server
const PORT = process.env.PORT || 3006;
https.createServer(options, app).listen(PORT, () => {
  console.log(`✅ Secure HTTPS Server running on port ${PORT}`);
});
