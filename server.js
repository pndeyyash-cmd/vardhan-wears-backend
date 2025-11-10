// Import necessary packages
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require('path'); 

// Load environment variables from .env file
dotenv.config();

// --- MODEL REGISTRATION ---
// Register models *before* they are used by routes
require('./models/User');
require('./models/Category');
require('./models/Product');
require('./models/Order');
require('./models/Cart');

// --- ROUTE IMPORTS ---
const productRoutes = require('./routes/productRoutes');
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const orderRoutes = require('./routes/orderRoutes'); 
const cartRoutes = require('./routes/cartRoutes');

// Initialize the Express app
const app = express();

// Define the port
const PORT = process.env.PORT || 5001;

// ===================================================================
// === CORS CONFIGURATION ===
// ===================================================================
// Explicitly list the URLs allowed to make requests.
const allowedOrigins = [
    'http://127.0.0.1:5500', // Your local dev server
    'http://localhost:5500',
    'http://127.0.0.1:5001', // Your local server
    'http://localhost:5001',
    'https://vardhan-wears.vercel.app' // <-- YOUR LIVE VERCEL URL
];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or Postman)
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

// --- GLOBAL MIDDLEWARE ---
app.use(cors(corsOptions)); // Apply CORS policy
app.use(express.json()); // Parse JSON bodies

// --- API ROUTES ---
app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);

// --- START SERVER ---
// Connect to MongoDB *first*, then start the server.
console.log('Connecting to MongoDB...');
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