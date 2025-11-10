const jwt = require('jsonwebtoken');
const User = require('../models/User');
const dotenv = require('dotenv');

dotenv.config();

// This middleware checks if a user is logged in
const protect = async (req, res, next) => {
    let token;

    // Read the token from the 'Authorization' header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header (it looks like "Bearer <token>")
            token = req.headers.authorization.split(' ')[1];

            // Verify the token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // ==========================================================
            // === THIS IS THE FIX ===
            // ==========================================================
            // The payload we sign is { id: "..." }, not { user: { id: "..." } }
            // We must read `decoded.id` directly.
            req.user = await User.findById(decoded.id).select('-password');
            // ==========================================================
            
            if (!req.user) {
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }

            next(); // User is valid, proceed to the next step
        } catch (error) {
            console.error(error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

// This middleware checks if the user is an Admin
const admin = (req, res, next) => {
    if (req.user && req.user.isAdmin) {
        next(); // User is logged in AND is an admin, proceed.
    } else {
        res.status(403).json({ message: 'Not authorized as an admin' }); // 403 Forbidden
    }
};

module.exports = { protect, admin };