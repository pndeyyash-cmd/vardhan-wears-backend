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
require('./models/User');
require('./models/Category');
require('./models/Product');
require('./models/Order');
require('./models/Cart');


// Import routes (Now safe to import *after* models are registered)
const productRoutes = require('./routes/productRoutes');
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const orderRoutes = require('./routes/orderRoutes'); 
const cartRoutes = require('./routes/cartRoutes');

// Initialize the Express app
const app = express();

// ===================================================================
// === DEPLOYMENT FIX 1: CONFIGURE CORS FOR PRODUCTION ===
// ===================================================================
// We must explicitly list the URLs that are allowed to make requests.
const allowedOrigins = [
    'http://127.0.0.1:5500', // Your local dev server
    'http://localhost:5500',
    'http://127.0.0.1:5001', // Your current local server
    'http://localhost:5001',
    'https://vardhan-wears.netlify.app' // Placeholder for our future frontend
];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
// =================== END OF FIX 1 ===================

// Middleware
app.use(express.json());

// --- API Routes ---
// Tell Express to use the routes
app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);


// ===================================================================
// === DEPLOYMENT FIX 2: REMOVE STATIC FILE SERVING ===
// ===================================================================
// This backend is an API. It should NOT serve the frontend.
// The frontend will be deployed separately (e.g., to Netlify).
// These lines have been removed:
// const staticPath = path.join(__dirname, '../');
// app.use(express.static(staticPath));
// =================== END OF FIX 2 ===================


// Define the port the server will listen on
// This is correct for Render.
const PORT = process.env.PORT || 5001;