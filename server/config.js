require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  db: {
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'raya_bingo'
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || null
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'raya-secret-key-2024',
    expiresIn: '7d'
  },

  // Telebirr API
  telebirr: {
    apiKey: process.env.TELEBIRR_API_KEY,
    apiUrl: process.env.TELEBIRR_API_URL || 'https://api.telebirr.et'
  },

  // Google Cloud TTS
  googleCloud: {
    projectId: process.env.GOOGLE_PROJECT_ID,
    keyFile: process.env.GOOGLE_KEY_FILE
  },

  // Game settings
  game: {
    maxPlayersPerRoom: 1000,
    countdownSeconds: 25,
    platformCommission: 0.25, // 25%
    numbersDelay: 3500 // ms between number calls
  }
};
