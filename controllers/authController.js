const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Zone = require('../models/Zone');
const Branch = require('../models/Branch');
const generateUserId = require('../utils/generateUserId');
const generateToken = require('../utils/generateToken');
const { ROLES, SELF_REGISTERABLE_ROLES, STATUS } = require('../utils/constants');

// @route  POST /api/auth/register
// @desc   Public registration. Role must be one of the 4 self-registerable roles.
//         Account is created with status "pending" and must be approved by the
//         relevant Super Admin / Regional Manager / Branch Head before login works.
const register = async (req, res) => {
  try {
    const { name, phone, email, password, role, zone, branch } = req.body;

    if (!name || !phone || !email || !password || !role) {
      return res.status(400).json({ message: 'name, phone, email, password and role are required' });
    }
    if (!SELF_REGISTERABLE_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role for self-registration' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Zone is required for Regional Manager, Branch Head, Technician, Salesperson
    if (role !== ROLES.SUPER_ADMIN && !zone) {
      return res.status(400).json({ message: 'Zone is required for this role' });
    }
    // Branch is required for Branch Head, Technician, Salesperson (not Regional Manager)
    if ([ROLES.BRANCH_HEAD, ROLES.TECHNICIAN, ROLES.SALESPERSON].includes(role) && !branch) {
      return res.status(400).json({ message: 'Branch is required for this role' });
    }

    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) return res.status(409).json({ message: 'Email is already registered' });

    const existingPhone = await User.findOne({ phone: phone.trim() });
    if (existingPhone) return res.status(409).json({ message: 'Phone number is already registered' });

    if (zone) {
      const zoneDoc = await Zone.findById(zone);
      if (!zoneDoc) return res.status(400).json({ message: 'Selected zone does not exist' });
    }
    if (branch) {
      const branchDoc = await Branch.findById(branch);
      if (!branchDoc) return res.status(400).json({ message: 'Selected branch does not exist' });
      if (zone && String(branchDoc.zone) !== String(zone)) {
        return res.status(400).json({ message: 'Selected branch does not belong to the selected zone' });
      }
    }

    const userId = await generateUserId(role);
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      userId,
      name,
      phone,
      email: email.toLowerCase(),
      passwordHash,
      role,
      status: STATUS.PENDING,
      zone: zone || null,
      branch: branch || null,
    });

    res.status(201).json({
      message: 'Registration submitted. Your account is pending approval.',
      userId: user.userId,
    });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
};

// @route  POST /api/auth/login
// @desc   Login using phone number + password. UserID is reserved for password reset only.
const login = async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ message: 'Phone number and password are required' });
    }

    const user = await User.findOne({ phone: phone.trim() });
    if (!user) return res.status(401).json({ message: 'Invalid phone number or password' });

    if (!user.isActive) return res.status(403).json({ message: 'This account has been deactivated' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid phone number or password' });

    if (user.status === STATUS.PENDING) {
      return res.status(403).json({ message: 'Your account is still pending approval' });
    }
    if (user.status === STATUS.REJECTED) {
      return res.status(403).json({ message: 'Your registration was rejected. Contact your administrator.' });
    }

    const token = generateToken(user);
    res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
};

// @route  POST /api/auth/forgot-password
// @desc   Generates a 6-digit OTP and returns it directly in the response for demo
//         purposes (no real SMS/email gateway wired up). In production, replace the
//         response payload with an actual send-via-SMS/email call and don't return the OTP.
const forgotPassword = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'UserID is required' });

    const user = await User.findOne({ userId: userId.trim().toUpperCase() });
    if (!user) return res.status(404).json({ message: 'No account found with that UserID' });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    user.resetOtp = otp;
    user.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000); // valid 10 minutes
    await user.save();

    res.json({
      message: 'OTP generated. (Demo mode: no SMS/email provider connected, so it is returned here.)',
      demoOtp: otp,
      expiresInMinutes: 10,
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not generate OTP', error: err.message });
  }
};

// @route  POST /api/auth/reset-password
const resetPassword = async (req, res) => {
  try {
    const { userId, otp, newPassword } = req.body;
    if (!userId || !otp || !newPassword) {
      return res.status(400).json({ message: 'UserID, OTP and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({ userId: userId.trim().toUpperCase() });
    if (!user) return res.status(404).json({ message: 'No account found with that UserID' });

    if (!user.resetOtp || user.resetOtp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    if (!user.resetOtpExpiry || user.resetOtpExpiry < new Date()) {
      return res.status(400).json({ message: 'OTP has expired, please request a new one' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetOtp = null;
    user.resetOtpExpiry = null;
    await user.save();

    res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not reset password', error: err.message });
  }
};

module.exports = { register, login, forgotPassword, resetPassword };
