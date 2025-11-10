const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../models/Order');
const Product = require('../models/Product'); 
const { protect, admin } = require('../middleware/authMiddleware');
const dotenv = require('dotenv');

dotenv.config();

// Initialize Razorpay instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * @route   POST /api/orders
 * @desc    Create a new order and generate Razorpay order ID (V3)
 * @access  Private
 */
router.post('/', protect, async (req, res) => {
    try {
        const { orderItems, shippingAddress, totalPrice } = req.body;

        // **MODIFIED: V3 Stock Check**
        for (const item of orderItems) {
            const product = await Product.findById(item.product).select('variants name');
            if (!product) {
                return res.status(404).json({ message: `Product not found: ${item.name}` });
            }
            
            // **FIXED: Check against item.colorName**
            const variant = product.variants.find(v => v.size === item.size && v.colorName === item.colorName);
            
            if (!variant) {
                return res.status(404).json({ message: `Variant not found for ${item.name} (Size: ${item.size}, Color: ${item.colorName})` });
            }

            if (variant.stock < item.quantity) {
                return res.status(400).json({ 
                    message: `Not enough stock for ${item.name} (${item.size}, ${item.colorName}). Only ${variant.stock} left.` 
                });
            }
        }
        // **END MODIFIED**

        // 1. Create the Razorpay order
        const options = {
            amount: Math.round(totalPrice * 100),
            currency: 'INR',
            receipt: `rcpt_${new Date().getTime()}`,
        };

        const razorpayOrder = await razorpay.orders.create(options);

        if (!razorpayOrder) {
            return res.status(500).json({ message: 'Razorpay order creation failed' });
        }

        // 2. Create the order in *our* database
        const newOrder = new Order({
            user: req.user.id, 
            orderItems, // These items now contain 'colorName'
            shippingAddress,
            totalPrice,
            paymentDetails: {
                razorpayOrderId: razorpayOrder.id,
            },
            isPaid: false,
            isCancelled: false,
        });

        const savedOrder = await newOrder.save();

        // 3. Send back the order details
        res.status(201).json({
            message: 'Order created successfully',
            orderId: savedOrder._id,
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: process.env.RAZORPAY_KEY_ID,
        });

    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route   POST /api/orders/verify
 * @desc    Verify payment and decrement stock (V3)
 * @access  Private
 */
router.post('/verify', protect, async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            order_id, // Our database order ID
        } = req.body;

        const order = await Order.findById(order_id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.isPaid) {
            return res.json({ message: 'Payment already verified' });
        }

        // 2. Create the expected signature
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
        const expectedSignature = hmac.digest('hex');

        // 3. Compare the signatures
        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ message: 'Payment verification failed: Invalid signature' });
        }

        // 4. Payment is LEGITIMATE. Fetch details.
        const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
        if (!paymentDetails) {
            return res.status(500).json({ message: 'Error fetching payment details from Razorpay' });
        }

        // **MODIFIED: V3 Stock Decrement**
        const bulkOps = order.orderItems.map(item => ({
            updateOne: {
                filter: { 
                    _id: item.product, 
                    "variants": { 
                        "$elemMatch": { 
                            "size": item.size, 
                            // **FIXED: Use item.colorName**
                            "colorName": item.colorName 
                        }
                    }
                },
                update: { 
                    "$inc": { "variants.$.stock": -item.quantity } 
                }
            }
        }));
        
        await Product.bulkWrite(bulkOps);
        // **END MODIFIED**

        // 5. Update our database with all details.
        order.isPaid = true;
        order.paidAt = Date.now();
        order.paymentDetails = {
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
            paymentMethod: paymentDetails.method,
        };

        await order.save();

        // 6. Send success response
        res.json({
            message: 'Payment verified successfully',
            orderId: order._id,
            paymentId: razorpay_payment_id,
        });

    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


/**
 * @route   POST /api/orders/validate-cart
 * @desc    Validate stock for a list of cart items (V3)
 * @access  Public
 */
router.post("/validate-cart", async (req, res) => {
  try {
    // **FIXED: Expects items with 'colorName'**
    const { items } = req.body // Expects an array: [{ id, quantity, size, colorName }]

    if (!Array.isArray(items)) {
      return res.status(400).json({ message: "Invalid request: items must be an array." })
    }

    const productIds = [...new Set(items.map(item => item.id))]
    const productsFromDB = await Product.find({ _id: { $in: productIds } }).select('variants');

    // Create a stock lookup map for *variants*
    // Key: "productID-size-colorName", Value: stock
    const stockMap = new Map();
    productsFromDB.forEach(p => {
      p.variants.forEach(v => {
        const key = `${p._id}-${v.size}-${v.colorName}`;
        stockMap.set(key, v.stock);
      });
    });

    let canCheckout = true; 
    const validatedItems = items.map(cartItem => {
      // **FIXED: Use cartItem.colorName**
      const key = `${cartItem.id}-${cartItem.size}-${cartItem.colorName}`;
      const realStock = stockMap.get(key) || 0; 
      const hasSufficientStock = realStock >= cartItem.quantity;
      
      if (realStock === 0) {
        canCheckout = false; 
      }
      if (realStock > 0 && !hasSufficientStock) {
        canCheckout = false; 
      }

      return {
        ...cartItem,
        realStock: realStock,
        hasSufficientStock: hasSufficientStock,
        isLowStock: realStock > 0 && realStock <= 3,
        isOutOfStock: realStock === 0
      };
    });

    res.json({
      validatedItems: validatedItems,
      canCheckout: canCheckout 
    });

  } catch (error) {
    console.error("Error validating stock:", error)
    res.status(500).json({ message: "Server error" })
  }
});

/**
 * @route   GET /api/orders/myorders
 * @desc    Get logged in user's orders
 * @access  Private
 */
router.get('/myorders', protect, async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
        if (!orders) { return res.status(404).json({ message: 'You have no orders.' }); }
        res.json(orders);
    } catch (error) {
        console.error('Error fetching user orders:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route   GET /api/orders
 * @desc    Get all orders
 * @access  Private/Admin
 */
router.get('/', protect, admin, async (req, res) => {
    try {
        const orders = await Order.find({}).populate('user', 'name email').sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        console.error('Error fetching all orders:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route   GET /api/orders/:id
 * @desc    Get order by ID
 * @access  Private
 */
router.get('/:id', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('user', 'name email');
        if (!order) { return res.status(404).json({ message: 'Order not found' }); }
        if (req.user.isAdmin || order.user._id.toString() === req.user.id) {
            res.json(order);
        } else {
            return res.status(401).json({ message: 'Not authorized to view this order' });
        }
    } catch (error) {
        console.error('Error fetching order by ID:', error);
        if (error.name === 'CastError') { return res.status(400).json({ message: 'Invalid order ID format' }); }
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route   PUT /api/orders/:id/deliver
 * @desc    Mark order as delivered
 * @access  Private/Admin
 */
router.put('/:id/deliver', protect, admin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) { return res.status(404).json({ message: 'Order not found' }); }
        order.isDelivered = true;
        order.deliveredAt = Date.now();
        const updatedOrder = await order.save();
        res.json(updatedOrder);
    } catch (error) {
        console.error('Error marking order as delivered:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


/**
 * @route   POST /api/orders/:id/repay
 * @desc    Create a new Razorpay order for an existing unpaid order (V3)
 * @access  Private
 */
router.post('/:id/repay', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) { return res.status(404).json({ message: 'Order not found' }); }
        if (order.user.toString() !== req.user.id) { return res.status(401).json({ message: 'Not authorized' }); }
        if (order.isPaid) { return res.status(400).json({ message: 'Order is already paid' }); }
        if (order.isCancelled) { return res.status(400).json({ message: 'This order has been cancelled' }); }

        // **MODIFIED: V3 Stock Check**
        for (const item of order.orderItems) {
            const product = await Product.findById(item.product).select('variants name');
            if (!product) {
                return res.status(404).json({ message: `Product not found: ${item.name}` });
            }
            // **FIXED: Check against item.colorName**
            const variant = product.variants.find(v => v.size === item.size && v.colorName === item.colorName);
            if (!variant) {
                return res.status(404).json({ message: `Variant not found for ${item.name}` });
            }
            if (variant.stock < item.quantity) {
                return res.status(400).json({ 
                    message: `Cannot repay: ${item.name} (${item.size}, ${item.colorName}) is now out of stock.` 
                });
            }
        }
        // **END MODIFIED**

        // 1. Create a NEW Razorpay order
        const options = {
            amount: Math.round(order.totalPrice * 100),
            currency: 'INR',
            receipt: `rcpt_${order._id}_${Date.now()}`.substring(0, 40),
        };
        const razorpayOrder = await razorpay.orders.create(options);

        if (!razorpayOrder) {
            return res.status(500).json({ message: 'Razorpay order creation failed' });
        }

        // 2. Update our order with the NEW Razorpay order ID
        order.paymentDetails.razorpayOrderId = razorpayOrder.id;
        await order.save();

        // 3. Send back the details to the frontend
        res.json({
            message: 'Repayment order created',
            orderId: order._id, 
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: process.env.RAZORPAY_KEY_ID,
        });

    } catch (error) {
        console.error('Error creating repay order:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route   PUT /api/orders/:id/cancel
 * @desc    Mark an order as cancelled (User only)
 * @access  Private
 */
router.put('/:id/cancel', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) { return res.status(404).json({ message: 'Order not found' }); }
        if (order.user.toString() !== req.user.id) { return res.status(401).json({ message: 'Not authorized' }); }
        if (order.isPaid) { return res.status(400).json({ message: 'Cannot cancel a paid order' }); }

        order.isCancelled = true;
        const updatedOrder = await order.save();
        res.json(updatedOrder);

    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route   DELETE /api/orders/:id
 * @desc    Delete an order (Admin Only) (V3)
 * @access  Private/Admin
 */
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // **MODIFIED: V3 Restock Logic**
        if (order.isPaid && !order.isCancelled) {
            console.log('Restocking variants for deleted paid order...');
            const bulkOps = order.orderItems.map(item => ({
                updateOne: {
                    filter: { 
                        _id: item.product, 
                        "variants": { 
                            "$elemMatch": { 
                                "size": item.size, 
                                // **FIXED: Use item.colorName**
                                "colorName": item.colorName 
                            }
                        }
                    },
                    update: { 
                        "$inc": { "variants.$.stock": item.quantity } 
                    }
                }
            }));
            await Product.bulkWrite(bulkOps);
        }
        // **END MODIFIED**

        await Order.deleteOne({ _id: req.params.id });
        res.json({ message: 'Order permanently deleted' });

    } catch (error) {
        console.error('Error deleting order:', error);
        // ** THIS IS THE LINE THAT WAS FIXED **
        res.status(500).json({ message: 'Server error' });
    }
});


module.exports = router;