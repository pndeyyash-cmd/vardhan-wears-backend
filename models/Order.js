const mongoose = require('mongoose');

// This schema defines what an individual item in the cart looks like
const orderItemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    image: { type: String, required: true },
    size: { type: String, required: true },
    
    // **FIXED: This is the 'colorName' fix from our previous step**
    colorName: { type: String, required: true }, 

    product: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Product',
    },
});

const orderSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        orderItems: [orderItemSchema], 
        shippingAddress: {
            fullName: { type: String, required: true },
            address: { type: String, required: true },
            city: { type: String, required: true },
            postalCode: { type: String, required: true },
            country: { type: String, required: true },
            phone: { type: String, required: true },
        },
        paymentDetails: {
            razorpayPaymentId: { type: String },
            razorpayOrderId: { type: String },
            razorpaySignature: { type: String },
            paymentMethod: { type: String }, 
        },
        totalPrice: {
            type: Number,
            required: true,
            default: 0.0,
        },
        isPaid: {
            type: Boolean,
            required: true,
            default: false,
        },
        paidAt: {
            type: Date,
        },
        isDelivered: {
            type: Boolean,
            required: true,
            default: false,
        },
        deliveredAt: {
            type: Date,
        },
        isCancelled: {
            type: Boolean,
            required: true,
            default: false,
        },
    },
    {
        timestamps: true, 
    }
);

// **THE FIX for OverwriteModelError**
// This checks if the model already exists before trying to create it.
module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);