const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000;
const MAX_REQUESTS_PER_MINUTE = 120;

const agentRequestCounts = new Map();
const AGENT_RATE_LIMIT = 60;
const AGENT_WINDOW = 60000;

export function rateLimiter(req, res, next) {
  const now = Date.now();
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  const key = `${clientIp}:${Math.floor(now / RATE_LIMIT_WINDOW)}`;
  
  let count = requestCounts.get(key) || 0;
  count++;
  
  if (count > MAX_REQUESTS_PER_MINUTE) {
    return res.status(429).json({
      success: false,
      status: 429,
      message: 'Rate limit exceeded',
      data: null,
      error: {
        type: 'rate_limit_exceeded',
        code: 'ERR_RATE_LIMIT'
      }
    });
  }
  
  requestCounts.get(key);
  requestCounts.set(key, count);
  
  setTimeout(() => {
    const oldKey = `${clientIp}:${Math.floor((now - RATE_LIMIT_WINDOW) / RATE_LIMIT_WINDOW)}`;
    requestCounts.delete(oldKey);
  }, RATE_LIMIT_WINDOW * 2);
  
  next();
}

export function agentRateLimiter(req, res, next) {
  const now = Date.now();
  const agentId = req.body?.agent || req.headers['x-agent-id'] || 'unknown';
  
  const key = `${agentId}:${Math.floor(now / AGENT_WINDOW)}`;
  
  let count = agentRequestCounts.get(key) || 0;
  count++;
  
  if (count > AGENT_RATE_LIMIT) {
    return res.status(429).json({
      success: false,
      status: 429,
      message: `Agent ${agentId} rate limit exceeded`,
      data: null,
      error: {
        type: 'agent_rate_limit',
        code: 'ERR_AGENT_RATE_LIMIT'
      }
    });
  }
  
  agentRequestCounts.set(key, count);
  
  setTimeout(() => {
    const oldKey = `${agentId}:${Math.floor((now - AGENT_WINDOW) / AGENT_WINDOW)}`;
    agentRequestCounts.delete(oldKey);
  }, AGENT_WINDOW * 2);
  
  next();
}

export function cleanupRateLimits() {
  const now = Date.now();
  
  for (const [key, _] of requestCounts) {
    const window = parseInt(key.split(':')[1]);
    if (Math.floor(now / RATE_LIMIT_WINDOW) - window > 1) {
      requestCounts.delete(key);
    }
  }
  
  for (const [key, _] of agentRequestCounts) {
    const window = parseInt(key.split(':')[1]);
    if (Math.floor(now / AGENT_WINDOW) - window > 1) {
      agentRequestCounts.delete(key);
    }
  }
}

setInterval(cleanupRateLimits, 60000);

export default { rateLimiter, agentRateLimiter, cleanupRateLimits };