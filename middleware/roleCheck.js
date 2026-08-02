/**
 * Restricts a route to a fixed list of roles.
 * Usage: router.get('/x', protect, allowRoles('SuperAdmin', 'RegionalManager'), handler)
 */
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action' });
    }
    next();
  };
}

module.exports = { allowRoles };
