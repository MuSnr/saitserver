const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

dotenv.config();

const logger = require('./services/logger');
const { apiLimiter } = require('./middleware/rateLimiter');

// Routes
const userRoutes = require('./routes/userRoutes');
const assetRoutes = require('./routes/assetRoutes');
const insuranceRoutes = require('./routes/insuranceRoutes');
const claimRoutes = require('./routes/claimRoutes');
const policyRoutes = require('./routes/policyRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const campusRoutes = require('./routes/campusRoutes');
const subCampusRoutes = require('./routes/subCampusRoutes');

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',');
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: Origin ${origin} not allowed.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── HTTP request logging ──────────────────────────────────────────────────────
app.use(
  morgan('combined', {
    stream: {
      write: (msg) => logger.http(msg.trim()),
    },
  })
);

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api/', apiLimiter);

// ── Static uploads ────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'SAIT API is running.',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/users', userRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/insurance-register', insuranceRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/campuses', campusRoutes);
app.use('/api/sub-campuses', subCampusRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);

  // Multer file type error
  if (err.message === 'Unsupported file type') {
    return res.status(400).json({ success: false, message: err.message });
  }
  // CORS error
  if (err.message && err.message.startsWith('CORS')) {
    return res.status(403).json({ success: false, message: err.message });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message,
  });
});

// ── Database & Server start ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    logger.info('MongoDB connected successfully.');

    // Seed default campuses if none exist
    const Campus = require('./models/Campus');
    const count = await Campus.countDocuments();
    if (count === 0) {
      const defaults = [
        { name: 'Ruimsig',      shortName: 'NPR', initials: 'NPR' },
        { name: 'Paulshof',     shortName: 'NPP', initials: 'NPP' },
        { name: 'Midrand',      shortName: 'NPM', initials: 'NPM' },
        { name: 'Boksburg',     shortName: 'NPB', initials: 'NPB' },
        { name: 'North Riding', shortName: 'NPN', initials: 'NPN' },
      ];
      await Campus.insertMany(defaults);
      logger.info('Default campuses seeded.');
    }

    app.listen(PORT, () => {
      logger.info(`SAIT API server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  })
  .catch((err) => {
    logger.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });

module.exports = app;
