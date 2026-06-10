require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Import routers
const authRouter = require('./routes/auth');
const walletRouter = require('./routes/wallet');
const gameRouter = require('./routes/game');
const adminRouter = require('./routes/admin');

// Import services
const { initializeDatabase } = require('./db/db');
const { initializeRedis } = require('./services/redis');
const { GameEngine } = require('./services/gameEngine');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Initialize database and Redis
let db, redis;
(async () => {
  db = await initializeDatabase();
  redis = await initializeRedis();
  console.log('✅ Database & Redis initialized');
})();

// Attach services to app
app.locals.db = db;
app.locals.redis = redis;
app.locals.io = io;

// Routes
app.use('/api/auth', authRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/game', gameRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Server running', timestamp: new Date() });
});

// Serve static files from client build
app.use(express.static(path.join(__dirname, '../dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Socket.IO events
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', (data) => {
    const { roomId, userId } = data;
    socket.join(`room-${roomId}`);
    io.to(`room-${roomId}`).emit('player-joined', { userId, socketId: socket.id });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    status: err.status || 500
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Raya Bingo Server running on port ${PORT}`);
});

module.exports = { app, server, io };
