const express = require('express');
const router = express.Router();
const { verifyToken } = require('./auth');
const { v4: uuidv4 } = require('uuid');

// Get all available rooms
router.get('/rooms', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const result = await db.query(
      'SELECT id, name, entry_fee, max_players FROM game_rooms ORDER BY entry_fee ASC'
    );

    res.json({
      rooms: result.rows.map(room => ({
        id: room.id,
        name: room.name,
        price: parseFloat(room.entry_fee),
        maxPlayers: room.max_players
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Join game room
router.post('/join-room', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.body;
    const db = req.app.locals.db;
    const redis = req.app.locals.redis;

    // Verify room exists
    const roomResult = await db.query('SELECT * FROM game_rooms WHERE id = $1', [roomId]);
    if (!roomResult.rows.length) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = roomResult.rows[0];

    // Get or create game session
    const sessionResult = await db.query(
      `SELECT * FROM game_sessions 
       WHERE room_id = $1 AND status = 'active' 
       ORDER BY created_at DESC LIMIT 1`,
      [roomId]
    );

    let sessionId;
    if (sessionResult.rows.length) {
      sessionId = sessionResult.rows[0].id;
    } else {
      // Create new session
      const newSessionResult = await db.query(
        `INSERT INTO game_sessions (room_id, status) 
         VALUES ($1, $2) RETURNING id`,
        [roomId, 'active']
      );
      sessionId = newSessionResult.rows[0].id;
    }

    // Store player in Redis for real-time tracking
    await redis.sadd(`room:${roomId}:players`, req.userId.toString());

    // Get player count
    const playerCount = await redis.scard(`room:${roomId}:players`);

    res.json({
      success: true,
      sessionId,
      roomId,
      countdownSeconds: 25,
      activePlayers: playerCount,
      roomName: room.name,
      entryFee: parseFloat(room.entry_fee)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get player's cards in a session
router.get('/cards/:sessionId', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const db = req.app.locals.db;

    const result = await db.query(
      `SELECT id, card_data FROM bingo_cards 
       WHERE user_id = $1`,
      [req.userId]
    );

    res.json({
      cards: result.rows.map(row => ({
        id: row.id,
        data: row.card_data
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark number on card (during gameplay)
router.post('/mark-number', verifyToken, async (req, res) => {
  try {
    const { cardId, number } = req.body;
    const db = req.app.locals.db;

    await db.query(
      `UPDATE bingo_cards 
       SET marked_numbers = CASE 
         WHEN marked_numbers::jsonb @> $1::jsonb THEN marked_numbers
         ELSE marked_numbers || $1::jsonb
       END
       WHERE id = $1 AND user_id = $2`,
      [JSON.stringify([number]), cardId, req.userId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Claim BINGO win
router.post('/claim-bingo', verifyToken, async (req, res) => {
  try {
    const { cardId, sessionId } = req.body;
    const db = req.app.locals.db;

    // Verify card belongs to user
    const cardResult = await db.query(
      'SELECT * FROM bingo_cards WHERE id = $1 AND user_id = $2',
      [cardId, req.userId]
    );

    if (!cardResult.rows.length) {
      return res.status(403).json({ error: 'Card not found' });
    }

    // Get session to verify it's active
    const sessionResult = await db.query(
      'SELECT * FROM game_sessions WHERE id = $1',
      [sessionId]
    );

    if (!sessionResult.rows.length || sessionResult.rows[0].status !== 'active') {
      return res.status(400).json({ error: 'Session not active' });
    }

    const session = sessionResult.rows[0];

    // Record winning
    const winResult = await db.query(
      `INSERT INTO winning_records (game_session_id, winner_id, card_id, prize_amount, pattern)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [sessionId, req.userId, cardId, parseFloat(session.prize_pool), 'BINGO']
    );

    // Update user balance
    await db.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [parseFloat(session.prize_pool), req.userId]
    );

    res.json({
      success: true,
      winningRecordId: winResult.rows[0].id,
      prizeAmount: parseFloat(session.prize_pool),
      message: '🎉 Congratulations! BINGO!'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get game statistics
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const db = req.app.locals.db;

    const result = await db.query(
      `SELECT 
         COUNT(DISTINCT game_sessions.id) as gamesPlayed,
         COUNT(DISTINCT winning_records.id) as totalWins,
         COALESCE(SUM(winning_records.prize_amount), 0) as totalWinnings
       FROM game_sessions
       LEFT JOIN winning_records ON game_sessions.id = winning_records.game_session_id
       WHERE winning_records.winner_id = $1`,
      [req.userId]
    );

    const stats = result.rows[0];

    res.json({
      gamesPlayed: parseInt(stats.gamesplayed) || 0,
      totalWins: parseInt(stats.totalwins) || 0,
      totalWinnings: parseFloat(stats.totalwinnings) || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
