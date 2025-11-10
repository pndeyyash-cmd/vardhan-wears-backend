const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { protect, admin } = require('../middleware/authMiddleware');
const crypto = require('crypto'); // Built-in Node.js module
const sgMail = require('@sendgrid/mail'); // SendGrid package

// Configure SendGrid
// It will automatically read the SENDGRID_API_KEY from your .env file
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Utility function to generate a token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Please enter all fields' });
        }
        if (password.length < 6) {
             return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
        });

        if (user) {
            const token = generateToken(user._id);
            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                isAdmin: user.isAdmin,
                token: token,
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (user && (await bcrypt.compare(password, user.password))) {
            const token = generateToken(user._id);
            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                isAdmin: user.isAdmin,
                token: token,
            });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get user profile (for auth check)
 * @access  Private
 */
router.get('/me', protect, async (req, res) => {
    try {
        // req.user is set by the protect middleware
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error('Get /me error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   PUT /api/auth/name
 * @desc    Update user's name
 * @access  Private
 */
router.put('/name', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        user.name = req.body.name || user.name;

        // ============ THIS IS THE FIX ============
        const updatedUser = await user.save();
        // Manually send back the object the client needs
        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            isAdmin: updatedUser.isAdmin,
            profilePicture: updatedUser.profilePicture
        });
        // ============ END FIX ============

    } catch (error) {
        console.error('Update name error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user's password
 * @access  Private
 */
router.put('/change-password', protect, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!(await bcrypt.compare(currentPassword, user.password))) {
            return res.status(401).json({ message: 'Invalid current password' });
        }
        
        if (newPassword.length < 6) {
             return res.status(400).json({ message: 'New password must be at least 6 characters' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();
        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   PUT /api/auth/profile-picture
 * @desc    Update user's profile picture URL
 * @access  Private
 */
router.put('/profile-picture', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        user.profilePicture = req.body.profilePicture || user.profilePicture;
        
        // ============ THIS IS THE FIX ============
        const updatedUser = await user.save();
        // Send back the same clean object
        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            isAdmin: updatedUser.isAdmin,
            profilePicture: updatedUser.profilePicture
        });
        // ============ END FIX ============

    } catch (error) {
        console.error('Update profile picture error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   GET /api/auth/addresses
 * @desc    Get user's saved addresses
 * @access  Private
 */
router.get('/addresses', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('shippingAddresses');
        res.json(user.shippingAddresses);
    } catch (error) {
        console.error('Get addresses error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   POST /api/auth/addresses
 * @desc    Add a new shipping address
 * @access  Private
 */
router.post('/addresses', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.shippingAddresses.length >= 3) {
            return res.status(400).json({ message: 'You can only save a maximum of 3 addresses.' });
        }
        user.shippingAddresses.push(req.body);
        await user.save();
        res.status(201).json(user.shippingAddresses);
    } catch (error) {
        console.error('Add address error:', error);
        res.status(422).json({ message: `Validation Error: ${error.message}`});
    }
});

/**
 * @route   PUT /api/auth/addresses/:addrId
 * @desc    Update a shipping address
 * @access  Private
 */
router.put('/addresses/:addrId', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const addrIndex = user.shippingAddresses.findIndex(addr => addr._id.toString() === req.params.addrId);
        if (addrIndex === -1) {
            return res.status(404).json({ message: 'Address not found' });
        }
        // Update fields
        user.shippingAddresses[addrIndex] = { ...user.shippingAddresses[addrIndex].toObject(), ...req.body };
        await user.save();
        res.json(user.shippingAddresses);
    } catch (error) {
        console.error('Update address error:', error);
        res.status(422).json({ message: `Validation Error: ${error.message}`});
    }
});

/**
 * @route   DELETE /api/auth/addresses/:addrId
 * @desc    Delete a shipping address
 * @access  Private
 */
router.delete('/addresses/:addrId', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.shippingAddresses = user.shippingAddresses.filter(addr => addr._id.toString() !== req.params.addrId);
        await user.save();
        res.json(user.shippingAddresses);
    } catch (error) {
        console.error('Delete address error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});


// ==========================================================
// === V3.2 "FORGOT PASSWORD" ROUTES (PRO VERSION) ===
// ==========================================================

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Generate and email a password reset token
 * @access  Public
 */
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            // We don't want to reveal if a user exists or not
            return res.status(200).json({ message: 'If an account with that email exists, a reset link has been sent.' });
        }

        // 1. Generate a secure token
        const token = crypto.randomBytes(32).toString('hex');
        
        // 2. Save the token to the user
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        // 3. Create the reset link
        // We get the host from the request headers
        const host = req.get('host');
        const protocol = req.protocol;
        // This link will point to our new frontend page
        const resetURL = `${protocol}://${host}/reset-password.html?token=${token}`;

        // 4. Create the email message
        const msg = {
            to: user.email,
            from: process.env.FROM_EMAIL, // Your verified SendGrid sender
            subject: 'Vardhan Wears - Password Reset Request',
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                    <h2>Password Reset Request</h2>
                    <p>You are receiving this email because you (or someone else) requested a password reset for your account on Vardhan Wears.</p>
                    <p>Please click on the link below, or paste it into your browser to complete the process:</p>
                    <p><a href="${resetURL}" style="color: #db2777; font-weight: bold; text-decoration: none;">Reset Your Password</a></p>
                    <p>This link is valid for <strong>1 hour</strong>.</p>
                    <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
                    <br>
                    <p>Thank you,</p>
                    <p>The Vardhan Wears Team</p>
                </div>
            `,
        };

        // 5. Send the email via SendGrid
        await sgMail.send(msg);

        res.status(200).json({ message: 'If an account with that email exists, a reset link has been sent.' });

    } catch (error) {
        console.error('Forgot Password error:', error);
        // Log SendGrid errors
        if (error.response) {
            console.error(error.response.body);
        }
        res.status(500).json({ message: 'Error sending password reset email.' });
    }
});


/**
 * @route   POST /api/auth/reset-password
 * @desc    Process the password reset
 * @access  Public
 */
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (newPassword.length < 6) {
             return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        // 1. Find the user by the token AND check if it's expired
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() } // $gt = greater than
        });

        if (!user) {
            return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
        }

        // 2. Token is valid. Hash the new password.
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        // 3. Clear the token fields and save the user
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.status(200).json({ message: 'Password has been reset successfully. You can now log in.' });

    } catch (error) {
        console.error('Reset Password error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});


module.exports = router;