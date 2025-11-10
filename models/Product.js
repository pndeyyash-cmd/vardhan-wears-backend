const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
    size: {
        type: String,
        required: [true, "Variant size is required (e.g., 'M' or 'One Size')."],
    },
    colorName: {
        type: String,
        required: [true, "Variant color name is required (e.g., 'Black' or 'Standard')."],
    },
    colorHex: {
        type: String,
        required: [true, "Variant color hex is required (e.g., '#000000')."],
    },
    stock: {
        type: Number,
        required: true,
        min: [0, "Stock cannot be negative."],
        default: 0,
    },
}, { _id: true }); 


const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Product name is required."],
            trim: true,
            unique: true,
        },
        description: {
            type: String,
            required: [true, "Product description is required."],
        },
        price: {
            type: Number,
            required: [true, "Product price is required."],
            min: [0, "Price cannot be negative."],
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: [true, "Product category is required."],
        },
        images: [
            {
                type: String,
                required: [true, "At least one product image is required."],
            },
        ],
        variants: {
            type: [variantSchema],
            validate: {
                validator: function(v) {
                    return Array.isArray(v) && v.length > 0;
                },
                message: "Product must have at least one variant."
            }
        },
    },
    { timestamps: true }
);

// **THE FIX for OverwriteModelError**
module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);