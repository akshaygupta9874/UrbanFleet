// Safe defaults for modules that read configuration at import time. Integration
// tests override these with isolated Docker service addresses in CI.
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://localhost:27017/?replicaSet=rs0";
process.env.MONGODB_DB_NAME = "UrbanFleet";
process.env.REDIS_URL = "redis://127.0.0.1:6379/15";
process.env.JWT_ACCESS_SECRET = "test-access-secret-only";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-only";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.SENDGRID_API_KEY = "sample";
process.env.SENDGRID_FROM_EMAIL = "sendsampleom";
process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
