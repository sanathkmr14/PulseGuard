// Jest setupFiles runs before any test module is imported
process.env.NODE_ENV = 'test';
process.env.ALLOW_PRIVATE_IPS = 'true';
process.env.REDIS_ENABLED = 'false';
process.env.JWT_SECRET = 'test_jwt_secret_pulseguard_key_32_bytes_long!!';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/pulseguard_test';
process.env.PORT = '5055';
