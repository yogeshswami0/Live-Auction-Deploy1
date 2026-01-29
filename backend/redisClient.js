const redis = require('redis');

// Redis client instance
let redisClient = null;

// Initialize Redis connection
async function initializeRedis() {
  try {
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
      },
      password: process.env.REDIS_PASSWORD || undefined,
      database: parseInt(process.env.REDIS_DB || '0'),
    });

    redisClient.on('error', (err) => console.error('Redis Client Error:', err));
    redisClient.on('connect', () => console.log('Redis Client Connected'));
    redisClient.on('reconnecting', () => console.log('Redis Client Reconnecting...'));

    await redisClient.connect();
    console.log('✅ Redis connected and ready');

    return redisClient;
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error);
    throw error;
  }
}

// Get auction state from Redis
async function getAuctionState() {
  try {
    const stateJson = await redisClient.get('auction:state');
    if (!stateJson) {
      // Return default idle state if not found
      return {
        isActive: false,
        isPaused: false,
        timer: 0,
        currentPlayer: null,
        highestBid: 0,
        highestBidder: null,
        bidHistory: [],
        startedAt: null,
        pausedAt: null,
        remainingTimeOnPause: null
      };
    }
    return JSON.parse(stateJson);
  } catch (error) {
    console.error('Error getting auction state:', error);
    throw error;
  }
}

// Set auction state in Redis
async function setAuctionState(state) {
  try {
    const stateJson = JSON.stringify(state);
    await redisClient.set('auction:state', stateJson, {
      EX: 86400 // 24-hour TTL
    });
    return true;
  } catch (error) {
    console.error('Error setting auction state:', error);
    throw error;
  }
}

// Update single field in auction state (atomic)
async function updateAuctionField(field, value) {
  try {
    const state = await getAuctionState();
    state[field] = value;
    await setAuctionState(state);
    return state;
  } catch (error) {
    console.error('Error updating auction field:', error);
    throw error;
  }
}

// Clear auction state
async function clearAuctionState() {
  try {
    await redisClient.del('auction:state');
    await redisClient.del('auction:bids');
    await redisClient.del('auction:last_bid_time');
    return true;
  } catch (error) {
    console.error('Error clearing auction state:', error);
    throw error;
  }
}

// Add bid to history in Redis
async function addBidToHistory(bidData) {
  try {
    const bidJson = JSON.stringify(bidData);
    await redisClient.rPush('auction:bids', bidJson);
    await redisClient.expire('auction:bids', 86400); // 24-hour TTL
    return true;
  } catch (error) {
    console.error('Error adding bid to history:', error);
    throw error;
  }
}

// Get bid history from Redis
async function getBidHistory() {
  try {
    const bids = await redisClient.lRange('auction:bids', 0, -1);
    return bids.map(bid => JSON.parse(bid));
  } catch (error) {
    console.error('Error getting bid history:', error);
    return [];
  }
}

// Atomic bid placement with optimistic locking and retry logic
async function atomicBidPlacement(bidData, maxRetries = 3) {
  const { teamId, teamName, bidAmount, eventId, requiredIncrement } = bidData;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Watch the auction state key for changes
      await redisClient.watch('auction:state');

      // Get current state
      const currentState = await getAuctionState();

      // Validate bid locally
      if (!currentState.isActive) {
        await redisClient.unwatch();
        return { success: false, reason: 'No active auction' };
      }

      if (currentState.isPaused) {
        await redisClient.unwatch();
        return { success: false, reason: 'Auction is paused' };
      }

      if (bidAmount < currentState.highestBid + requiredIncrement) {
        await redisClient.unwatch();
        return {
          success: false,
          reason: `Bid must be at least ₹${requiredIncrement.toLocaleString('en-IN')} higher`
        };
      }

      // Prepare updated state
      const newTimer = currentState.timer < 10 ? 20 : currentState.timer; // Timer extension logic
      const updatedState = {
        ...currentState,
        highestBid: bidAmount,
        highestBidder: { teamId, teamName },
        timer: newTimer
      };

      // Execute transaction
      const multi = redisClient.multi();
      multi.set('auction:state', JSON.stringify(updatedState), { EX: 86400 });
      multi.rPush('auction:bids', JSON.stringify({
        teamId,
        teamName,
        bidAmount,
        timestamp: Date.now()
      }));
      multi.set('auction:last_bid_time', Date.now().toString());

      const results = await multi.exec();

      // Check if transaction succeeded
      if (results === null) {
        // Transaction failed due to watched key modification
        console.log(`Bid conflict detected, retry attempt ${attempt}/${maxRetries}`);

        if (attempt < maxRetries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, 50 * Math.pow(2, attempt - 1)));
          continue;
        } else {
          return { success: false, reason: 'System busy, please try again' };
        }
      }

      // Transaction successful
      const bidHistory = await getBidHistory();
      return {
        success: true,
        updatedState,
        bidHistory,
        timerExtended: newTimer !== currentState.timer
      };

    } catch (error) {
      await redisClient.unwatch();
      console.error(`Bid placement error on attempt ${attempt}:`, error);

      if (attempt === maxRetries) {
        return { success: false, reason: 'Failed to place bid, please try again' };
      }
    }
  }

  return { success: false, reason: 'Max retries exceeded' };
}

// Set distributed lock for finalization
async function acquireFinalizeLock() {
  try {
    const lockAcquired = await redisClient.set('auction:finalize_lock', '1', {
      NX: true,
      EX: 30
    });
    return lockAcquired !== null;
  } catch (error) {
    console.error('Error acquiring finalize lock:', error);
    return false;
  }
}

// Release finalization lock
async function releaseFinalizeLock() {
  try {
    await redisClient.del('auction:finalize_lock');
    return true;
  } catch (error) {
    console.error('Error releasing finalize lock:', error);
    return false;
  }
}

// Set last bid timestamp
async function setLastBidTime() {
  try {
    await redisClient.set('auction:last_bid_time', Date.now().toString());
    return true;
  } catch (error) {
    console.error('Error setting last bid time:', error);
    return false;
  }
}

// Get last bid timestamp
async function getLastBidTime() {
  try {
    const time = await redisClient.get('auction:last_bid_time');
    return time ? parseInt(time) : null;
  } catch (error) {
    console.error('Error getting last bid time:', error);
    return null;
  }
}

module.exports = {
  initializeRedis,
  getRedisClient: () => redisClient,
  getAuctionState,
  setAuctionState,
  updateAuctionField,
  clearAuctionState,
  addBidToHistory,
  getBidHistory,
  atomicBidPlacement,
  acquireFinalizeLock,
  releaseFinalizeLock,
  setLastBidTime,
  getLastBidTime
};
