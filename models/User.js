const mongoose = require('mongoose');

const shippingAddressSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: [true, 'Full name is required']
    },
    address: {
        type: String,
        required: [true, 'Street address is required']
    },
    city: {
        type: String,
        required: [true, 'City is required']
    },
    state: {
        type: String,
        required: [true, 'State is required']
    },
    postalCode: {
        type: String,
        required: [true, 'Postal code is required']
    },
    country: {
        type: String,
        required: true,
        default: 'India'
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        validate: {
            validator: function(v) {
                return /^\d{10}$/.test(v);
            },
            message: props => `${props.value} is not a valid 10-digit phone number!`
        }
    },
    countryCode: {
        type: String,
        required: true,
        default: '+91'
    }
}, {
    _id: true 
});


const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true, 
    },
    password: {
        type: String,
        required: true,
    },
    isAdmin: {
        type: Boolean,
        required: true,
        default: false, 
    },
    profilePicture: {
        type: String,
        default: '', 
    },
    shippingAddresses: {
        type: [shippingAddressSchema],
        validate: [
            (val) => val.length <= 3, 
            'You can only save a maximum of 3 shipping addresses.'
        ]
    },
    // ============ NEW FIELDS FOR V3.2 ============
    cart: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cart'
    },
    resetPasswordToken: {
        type: String
    },
    resetPasswordExpires: {
        type: Date
    }
    // ===============================================
}, {
    timestamps: true 
});

// **THE FIX for OverwriteModelError**
module.exports = mongoose.models.User || mongoose.model('User', userSchema);