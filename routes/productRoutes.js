const express = require("express")
const router = express.Router()
const Product = require("../models/Product")
const { protect, admin } = require("../middleware/authMiddleware")

/**
 * @route   GET /api/products
 * @desc    Get all products (or filter by category)
 * @access  Public
 */
router.get("/", async (req, res) => {
  try {
    const filter = {}
    if (req.query.category) {
      filter.category = req.query.category
    }
    
    // This route automatically works with the new model, as it just fetches all.
    // The .populate() is also unchanged.
    const products = await Product.find(filter).populate("category", "name")

    res.json(products)
  } catch (error) {
    console.error("Error fetching products:", error)
    res.status(500).json({ message: "Server error" })
  }
})

/**
 * @route   GET /api/products/:id
 * @desc    Get a single product
 * @access  Public
 */
router.get("/:id", async (req, res) => {
  try {
    // This route is also unchanged and works with the new model.
    const product = await Product.findById(req.params.id).populate("category", "name")
    if (product) {
      res.json(product)
    } else {
      res.status(404).json({ message: "Product not found" })
    }
  } catch (error) {
    console.error("Error fetching product by ID:", error)
    res.status(500).json({ message: "Server error" })
  }
})

/**
 * @route   POST /api/products
 * @desc    Create a new product (V3: With Variants)
 * @access  Private/Admin
 */
router.post("/", protect, admin, async (req, res) => {
  try {
    // **MODIFIED: Destructuring new V3 fields**
    const { name, description, price, category, images, variants } = req.body

    // The old `sizes`, `colors`, and `stock` are gone.

    const newProduct = new Product({
      name,
      description,
      price,
      category,
      images,
      variants, // **NEW: Saving the variants array**
    })

    const savedProduct = await newProduct.save()
    res.status(201).json(savedProduct)
  } catch (error) {
    console.error("Error creating product:", error)
    if (error.name === "ValidationError") {
      // This will now catch our new validation, e.g., "Product must have at least one variant."
      return res.status(422).json({ message: "Validation failed", errors: error.errors })
    }
    res.status(500).json({ message: "Server error" })
  }
})

/**
 * @route   PUT /api/products/:id
 * @desc    Update a product (V3: With Variants)
 * @access  Private/Admin
 */
router.put("/:id", protect, admin, async (req, res) => {
  try {
    // **MODIFIED: We now update with the new V3 fields**
    const { name, description, price, category, images, variants } = req.body
    
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id, 
      {
        name,
        description,
        price,
        category,
        images,
        variants, // **NEW: Updating the variants array**
      }, 
      {
        new: true,
        runValidators: true,
      }
    )

    if (updatedProduct) {
      res.json(updatedProduct)
    } else {
      res.status(404).json({ message: "Product not found" })
    }
  } catch (error) {
    console.error("Error updating product:", error)
    if (error.name === "ValidationError") {
      return res.status(422).json({ message: "Validation failed", errors: error.errors })
    }
    res.status(500).json({ message: "Server error" })
  }
})

/**
 * @route   DELETE /api/products/:id
 * @desc    Delete a product
 * @access  Private/Admin
 */
router.delete("/:id", protect, admin, async (req, res) => {
  try {
    // This route is unchanged, it works perfectly.
    const product = await Product.findById(req.params.id)

    if (product) {
      await product.deleteOne()
      res.json({ message: "Product removed" })
    } else {
      res.status(404).json({ message: "Product not found" })
    }
  } catch (error) {
    console.error("Error deleting product:", error)
    res.status(500).json({ message: "Server error" })
  }
})

//
// **DELETED**: The old `POST /api/products/validate-stock` route has been
// removed. Its logic was based on the V2 model and is now 100% wrong.
// We will build its replacement in the next phase, inside `orderRoutes.js`.
//

module.exports = router