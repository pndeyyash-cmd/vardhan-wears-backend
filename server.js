// Import necessary packages
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require('path'); 

// Load environment variables from .env file
dotenv.config();

// --- Connect to MongoDB ---
// We MUST connect to the database *before* registering models
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('MongoDB connected successfully!');
    
    // Start the server ONLY after the DB connection is successful
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
})
.catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit the process with an error
});


// --- MODEL PRE-REGISTRATION (THE FIX) ---
// This forces Mongoose to be aware of all models
// before any routes are defined, fixing the .populate() hanging bug.
require('./models/User');
require('./models/Category');
require('./models/Product');
require('./models/Order');
require('./models/Cart'); // <-- ADDED: Pre-register the new Cart model
// --- END FIX ---


// Import routes (Now safe to import *after* models are registered)
const productRoutes = require('./routes/productRoutes');
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const orderRoutes = require('./routes/orderRoutes'); 
const cartRoutes = require('./routes/cartRoutes'); // <-- ADDED: Import cart routes

// Initialize the Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// --- API Routes ---
// Tell Express to use the routes
app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes); // <-- ADDED: Use the new cart routes


// === SERVE STATIC FILES (Your Frontend) ===
// This tells Express to serve your root folder
const staticPath = path.join(__dirname, '../');
app.use(express.static(staticPath));

// ** THE INCORRECT CATCH-ALL ROUTE HAS BEEN REMOVED **
// app.use(express.static) is now correctly handling all file serving.
// A request for /admin.html will serve admin.html
// A request for /profile.html will serve profile.html

// Define the port the server will listen on
const PORT = process.env.PORT || 5001;