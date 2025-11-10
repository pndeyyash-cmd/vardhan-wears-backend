const mongoose = require('mongoose');

// This schema defines an item *inside* the cart.
// It is bound to a *specific variant* (size + colorName).
const cartItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    // Denormalized data for faster cart display (no populate needed)
    name: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    // --- V3.0 Variant-Specific Fields ---
    size: {
        type: String,
        required: true
    },
    colorName: {
        type: String,
        required: true
    },
    // --- End Variant Fields ---
    quantity: {
        type: Number,
        required: true,
        min: 1,
        default: 1
    }
}, { 
    // We use a composite key (product + size + colorName)
    // so we don't need a separate _id for each cart item.
    _id: false 
});


const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true // Each user has exactly one cart
    },
    items: [cartItemSchema],
}, {
    timestamps: true
});

// **THE FIX for OverwriteModelError**
module.exports = mongoose.models.Cart || mongoose.model('Cart', cartSchema);