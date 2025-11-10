const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect } = require('../middleware/authMiddleware');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User'); // We need this to associate the cart

// Pre-load Product model to prevent population issues
if (!mongoose.models.Product) {
    require('../models/Product');
}

/**
 * @route   GET /api/cart
 * @desc    Get the logged-in user's cart (and validate it)
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
    try {
        const cart = await Cart.findOne({ user: req.user.id });

        if (!cart || !cart.items) {
            return res.json({ items: [], subtotal: 0, total: 0 });
        }

        let canCheckout = true;
        let subtotal = 0;

        const validatedItems = await Promise.all(
            cart.items.map(async (item) => {
                // We use item.product because that's the ref ID in the schema
                const product = await Product.findById(item.product);
                
                if (!product) {
                    canCheckout = false;
                    return { 
                        ...item.toObject(), 
                        product: item.product, // Ensure ID is passed back
                        realStock: 0, 
                        isOutOfStock: true, 
                        hasSufficientStock: false 
                    };
                }
                
                const variant = product.variants.find(
                    v => v.size === item.size && v.colorName === item.colorName
                );

                if (!variant || variant.stock === 0) {
                    canCheckout = false;
                    return { 
                        ...item.toObject(), 
                        product: item.product,
                        realStock: 0, 
                        isOutOfStock: true, 
                        hasSufficientStock: false 
                    };
                }
                
                if (variant.stock < item.quantity) {
                    canCheckout = false;
                    return { 
                        ...item.toObject(), 
                        product: item.product,
                        realStock: variant.stock, 
                        isOutOfStock: false, 
                        hasSufficientStock: false,
                        isLowStock: (variant.stock <= 3)
                    };
                }
                
                // All good, add to subtotal
                subtotal += item.price * item.quantity;
                return { 
                    ...item.toObject(), 
                    product: item.product,
                    realStock: variant.stock, 
                    isOutOfStock: false, 
                    hasSufficientStock: true,
                    isLowStock: (variant.stock <= 3)
                };
            })
        );
        
        // **THIS IS THE FIX:**
        // Send the `validatedItems` array which contains the new stock info
        res.json({
            items: validatedItems, // <-- THE FIX
            subtotal: subtotal,
            canCheckout: canCheckout
        });

    } catch (error) {
        console.error('Error fetching user cart:', error.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   POST /api/cart/add
 * @desc    Add an item to the logged-in user's cart
 * @access  Private
 */
router.post('/add', protect, async (req, res) => {
    // **V3.1 FIX**: We expect `productId` from the front-end (as per product.html)
    const { productId, name, price, image, size, colorName, quantity } = req.body;

    if (!productId || !size || !colorName || !quantity || !name || !price || !image) {
        return res.status(400).json({ message: 'Missing required item properties.' });
    }

    try {
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found.' });
        }
        
        const variant = product.variants.find(v => v.size === size && v.colorName === colorName);
        if (!variant) {
            return res.status(404).json({ message: 'Selected variant not found.' });
        }

        let cart = await Cart.findOne({ user: req.user.id });
        if (!cart) {
            cart = new Cart({ user: req.user.id, items: [] });
        }

        // **V3.1 FIX**: Find by `product` field (the ID)
        const existingItemIndex = cart.items.findIndex(
            item => item.product.toString() === productId && item.size === size && item.colorName === colorName
        );

        let newQuantity = quantity;
        if (existingItemIndex > -1) {
            newQuantity = cart.items[existingItemIndex].quantity + quantity;
        }
        
        if (newQuantity > variant.stock) {
            return res.status(400).json({ 
                message: `Cannot add ${newQuantity} items. Only ${variant.stock} available in stock.` 
            });
        }

        if (existingItemIndex > -1) {
            cart.items[existingItemIndex].quantity = newQuantity;
        } else {
            // **V3.1 FIX**: Save `productId` to the `product` field
            cart.items.push({
                product: productId, // This is the `ref` field in the schema
                name,
                price,
                image,
                size,
                colorName,
                quantity: newQuantity
            });
        }

        await cart.save();
        res.status(200).json(cart.items);

    } catch (error) {
        console.error('Error adding to cart:', error.message);
        res.status(500).json({ message: 'Server Error' });
    }
});


/**
 * @route   PUT /api/cart/update
 * @desc    Update an item's quantity in the cart
 * @access  Private
 */
router.put('/update', protect, async (req, res) => {
    // **V3.1 FIX**: Expect `product` (the ID) from the body
    const { product, size, colorName, newQuantity } = req.body;

    if (!product || !size || !colorName) {
         return res.status(400).json({ message: 'Missing item identifiers.' });
    }

    if (newQuantity < 1) {
        return res.status(400).json({ message: 'Quantity must be at least 1.' });
    }

    try {
        const productDoc = await Product.findById(product);
        if (!productDoc) return res.status(404).json({ message: 'Product not found.' });
        
        const variant = productDoc.variants.find(v => v.size === size && v.colorName === colorName);
        if (!variant) return res.status(404).json({ message: 'Variant not found.' });
        
        if (newQuantity > variant.stock) {
            return res.status(400).json({ 
                message: `Cannot set quantity to ${newQuantity}. Only ${variant.stock} available.` 
            });
        }

        const cart = await Cart.findOne({ user: req.user.id });
        if (!cart) return res.status(404).json({ message: 'Cart not found.' });

        // **V3.1 FIX**: Find by `product` field
        const itemIndex = cart.items.findIndex(
            item => item.product.toString() === product && item.size === size && item.colorName === colorName
        );

        if (itemIndex > -1) {
            cart.items[itemIndex].quantity = newQuantity;
            await cart.save();
            res.status(200).json(cart.items);
        } else {
            res.status(404).json({ message: 'Item not found in cart.' });
        }

    } catch (error) {
        console.error('Error updating cart:', error.message);
        res.status(500).json({ message: 'Server Error' });
    }
});


/**
 * @route   DELETE /api/cart/remove
 * @desc    Remove an item from the cart
 * @access  Private
 */
router.delete('/remove', protect, async (req, res) => {
    // **V3.1 FIX**: Expect `product` (the ID) from the body
    const { product, size, colorName } = req.body;

    if (!product || !size || !colorName) {
         return res.status(400).json({ message: 'Missing item identifiers.' });
    }

    try {
        const cart = await Cart.findOne({ user: req.user.id });
        if (!cart) return res.status(404).json({ message: 'Cart not found.' });

        const initialLength = cart.items.length;
        // **V3.1 FIX**: Filter by `product` field
        cart.items = cart.items.filter(
            item => !(item.product.toString() === product && item.size === size && item.colorName === colorName)
        );

        if (cart.items.length === initialLength) {
            return res.status(404).json({ message: 'Item not found in cart.' });
        }

        await cart.save();
        res.status(200).json(cart.items);

    } catch (error) {
        console.error('Error removing from cart:', error.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   DELETE /api/cart/clear
 * @desc    Clear all items from the user's cart (after successful purchase)
 * @access  Private
 */
router.delete('/clear', protect, async (req, res) => {
    try {
        const cart = await Cart.findOne({ user: req.user.id });
        if (cart) {
            cart.items = [];
            await cart.save();
        }
        res.status(200).json({ message: 'Cart cleared successfully.' });
    } catch (error) {
        console.error('Error clearing cart:', error.message);
        res.status(500).json({ message: 'Server Error' });
    }
});


/**
 * @route   POST /api/cart/merge
 * @desc    Merge a guest's localStorage cart with their DB cart upon login
 * @access  Private
 */
router.post('/merge', protect, async (req, res) => {
    const { guestCart } = req.body; 

    if (!guestCart || !Array.isArray(guestCart)) {
        return res.status(400).json({ message: 'Invalid guest cart data.' });
    }

    try {
        let cart = await Cart.findOne({ user: req.user.id });
        if (!cart) {
            cart = new Cart({ user: req.user.id, items: [] });
        }

        // **V3.1 FIX**: Use `product` field for lookup
        const existingItems = new Set(
            cart.items.map(item => `${item.product}-${item.size}-${item.colorName}`)
        );

        for (const guestItem of guestCart) {
            // guestItem has `productId`, `size`, `colorName`
            if (!guestItem.productId || !guestItem.size || !guestItem.colorName) continue;

            const product = await Product.findById(guestItem.productId);
            if (!product) continue; 

            const variant = product.variants.find(
                v => v.size === guestItem.size && v.colorName === guestItem.colorName
            );
            if (!variant || variant.stock === 0) continue; 

            // **V3.1 FIX**: Use `productId` for key
            const itemKey = `${guestItem.productId}-${guestItem.size}-${guestItem.colorName}`;
            
            if (existingItems.has(itemKey)) {
                // **V3.1 FIX**: Find by `product` field
                const itemIndex = cart.items.findIndex(item => `${item.product}-${item.size}-${item.colorName}` === itemKey);
                if (itemIndex === -1) continue; // Should not happen

                let newQuantity = cart.items[itemIndex].quantity + guestItem.quantity;
                if (newQuantity > variant.stock) {
                    newQuantity = variant.stock;
                }
                cart.items[itemIndex].quantity = newQuantity;

            } else {
                let newQuantity = guestItem.quantity;
                if (newQuantity > variant.stock) {
                    newQuantity = variant.stock;
                }
                
                // **V3.1 FIX**: Map `productId` to `product`
                cart.items.push({
                    product: guestItem.productId, 
                    name: guestItem.name,
                    price: guestItem.price,
                    image: guestItem.image,
                    size: guestItem.size,
                    colorName: guestItem.colorName,
                    quantity: newQuantity
                });
            }
        }

        await cart.save();
        // ==========================================================
        // === THIS IS THE SYNTAX ERROR FIX ===
        // ==========================================================
        res.status(200).json(cart.items); // Changed `2m` to `200`

    } catch (error) {
        console.error('Error merging cart:', error.message);
        res.status(500).json({ message: 'Server Error' });
    }
});


/**
 * @route   POST /api/cart/validate-guest
 * @desc    Validate a guest's cart from localStorage (public)
 * @access  Public
 */
router.post('/validate-guest', async (req, res) => {
    const { guestCart } = req.body;

    if (!guestCart || !Array.isArray(guestCart)) {
        return res.status(400).json({ message: 'Invalid guest cart data.' });
    }
    
    let canCheckout = true;
    
    try {
        const validatedItems = await Promise.all(
            guestCart.map(async (item) => {
                try {
                    // **V3.1 FIX**: Guest cart uses `productId`
                    if (!item.productId || !item.size || !item.colorName) {
                        throw new Error('Invalid item structure');
                    }

                    const product = await Product.findById(item.productId);
                    if (!product) {
                        canCheckout = false;
                        return { ...item, realStock: 0, isOutOfStock: true, hasSufficientStock: false };
                    }
                    
                    const variant = product.variants.find(
                        v => v.size === item.size && v.colorName === item.colorName
                    );

                    if (!variant || variant.stock === 0) {
                        canCheckout = false;
                        return { ...item, realStock: 0, isOutOfStock: true, hasSufficientStock: false };
                    }
                    
                    if (variant.stock < item.quantity) {
                        canCheckout = false;
                        return { 
                            ...item, 
                            realStock: variant.stock, 
                            isOutOfStock: false, 
                            hasSufficientStock: false,
                            isLowStock: (variant.stock <= 3)
                        };
                    }
                    
                    // All good!
                    return { 
                        ...item, 
                        realStock: variant.stock, 
                        isOutOfStock: false, 
                        hasSufficientStock: true,
                        isLowStock: (variant.stock <= 3)
                    };
                } catch (err) {
                    // This item is bad (e.g., old/invalid productId)
                    console.error(`Error validating guest item ${item.productId}:`, err.message);
                    canCheckout = false;
                    return { ...item, realStock: 0, isOutOfStock: true, hasSufficientStock: false };
                }
            })
        );
        
        res.json({ validatedItems, canCheckout });

    } catch (error) {
        // This outer catch will now only fire for catastrophic server errors
        console.error('Error validating guest cart:', error.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;