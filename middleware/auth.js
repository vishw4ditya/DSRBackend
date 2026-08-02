const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { STATUS } = require('../utils/constants');

/**
 * Verifies the Bearer token, loads the full user from DB (so we always have
 * fresh status/zone/branch data, not stale values baked into an old token),
 * and rejects if the account is not approved or has been deactivated.
 */
async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized, no token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: 'User no longer exists' });
    if (!user.isActive) return res.status(403).json({ message: 'This account has been deactivated' });
    if (user.status !== STATUS.APPROVED) {
      return res.status(403).json({ message: 'Your account is not yet approved' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, invalid or expired token' });
  }
}

/**
 * Like `protect`, but never rejects the request. If a valid, approved-user token
 * is present, req.user is populated (so controllers can apply scoping). If not,
 * req.user is simply left undefined and the request proceeds as anonymous.
 * Used on endpoints like GET /zones and GET /branches that must work both from
 * the public registration form (no token) and from logged-in dashboards (scoped).
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (user && user.isActive && user.status === STATUS.APPROVED) {
      req.user = user;
    }
    next();
  } catch (err) {
    // Invalid/expired token on an optional route - just proceed as anonymous
    next();
  }
}

module.exports = { protect, optionalAuth };
