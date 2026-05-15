require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

// Prevent unhandled rejections / exceptions from killing the process in production
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err);
  // Give the logger a tick to flush, then exit so nodemon can restart cleanly
  setTimeout(() => process.exit(1), 100);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`RVR DPR API running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
