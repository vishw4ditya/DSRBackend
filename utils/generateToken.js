const jwt = require('jsonwebtoken');

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      userId: user.userId,
      role: user.role,
      zone: user.zone,
      branch: user.branch,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = generateToken;
