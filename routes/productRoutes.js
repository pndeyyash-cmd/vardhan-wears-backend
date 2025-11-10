const express = require("express")
const router = express.Router()
const Product = require("../models/Product")
const Category = require("../models/Category") // <-- 1. IMPORT CATEGORY MODEL
const { protect, admin } = require("../middleware/authMiddleware")

/**
 * @route   GET /api/products
 * @desc    Get all products (or filter by category & subcategory)
 * @access  Public
 */
// ===================================================================
// === START OF FIX: This entire route is replaced ===
// ===================================================================
router.get("/", async (req, res) => {
  try {
    const { category: parentCategory, subcategory } = req.query

    // This is the filter that will be applied to the Product collection
    const productFilter = {}

    // This is the filter to find the categories first
    const categoryFilter = {}

    if (parentCategory) {
      categoryFilter.parentCategory = parentCategory
    }

    if (subcategory) {
      categoryFilter.name = subcategory // The subcategory is the 'name' field
    }

    // If either filter is present, we must first find the category IDs
    if (parentCategory || subcategory) {
      // Find all categories that match the filter (e.g., parent="Kids" AND name="Boys Kurtas")
      const categories = await Category.find(categoryFilter).select('_id')
      
      if (categories.length === 0) {
        // No categories matched, so no products will match.
        return res.json([])
      }
      
      // Get an array of just the IDs
      const categoryIds = categories.map(c => c._id)
      
      // Set the product filter to find products where the 'category' field
      // is one of the IDs in our array.
      productFilter.category = { $in: categoryIds }
    }

    // Find the products using the built filter (which is either {} or { category: { $in: [...] } })
    // We populate 'parentCategory' so the admin table can display it.
    const products = await Product.find(productFilter)
        .populate("category", "name parentCategory") // <-- 2. POPULATE PARENT CATEGORY

    res.json(products)
  } catch (error) {
    console.error("Error fetching products:", error)
    res.status(500).json({ message: "Server error" })
  }
})
// ===================================================================
// === END OF FIX ===
// ===================================================================


/**
 * @route   GET /api/products/:id
 * @desc    Get a single product
 * @access  Public
 */
router.get("/:id", async (req, res) => {
  try {
    // This route is also unchanged and works with the new model.
    const product = await Product.findById(req.params.id)
        .populate("category", "name parentCategory") // <-- 3. (Optional but good) POPULATE PARENT HERE TOO
    
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

module.exports = router