const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true 
    },
    parentCategory: {
        type: String,
        required: true,
        enum: ['Men', 'Women', 'Kids', 'None'], 
        default: 'None'
    }
}, {
    timestamps: true
});

// **THE FIX for OverwriteModelError**
module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);