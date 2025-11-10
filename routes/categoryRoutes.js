const express = require("express")
const router = express.Router()
const Category = require("../models/Category")
const Product = require("../models/Product")
const { protect, admin } = require("../middleware/authMiddleware")

/**
 * @route   GET /api/categories
 * @desc    Get all categories
 * @access  Public
 */
router.get("/", async (req, res) => {
  try {
    // Find all categories and sort them by parent, then by name
    const categories = await Category.find().sort({ parentCategory: 1, name: 1 })
    res.json(categories)
  } catch (error) {
    console.error("Error fetching categories:", error)
    res.status(500).json({ message: "Server error" })
  }
})

/**
 * @route   POST /api/categories
 * @desc    Create a new category
 * @access  Private/Admin
 */
router.post("/", protect, admin, async (req, res) => {
  try {
    // **FIX: Get 'name' AND 'parentCategory' from the request body**
    const { name, parentCategory } = req.body

    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Category name is required" })
    }

    // **FIX: Include parentCategory when creating the new category**
    const newCategory = new Category({ 
        name: name.trim(),
        parentCategory: parentCategory || 'None' // Default to 'None' if not provided
    })

    const savedCategory = await newCategory.save()
    res.status(201).json(savedCategory)
  } catch (error) {
    console.error("Error creating category:", error)
    if (error.code === 11000) {
      return res.status(400).json({ message: "Category with that name already exists" })
    }
    res.status(500).json({ message: "Server error" })
  }
})

/**
 * @route   DELETE /api/categories/:id
 * @desc    Delete a category (with safety check)
 * @access  Private/Admin
 */
router.delete("/:id", protect, admin, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)

    if (!category) {
      return res.status(404).json({ message: "Category not found" })
    }

    // Check if any products use this category
    // This logic is correct and good.
    const productsWithCategory = await Product.countDocuments({ category: req.params.id })

    if (productsWithCategory > 0) {
      return res.status(400).json({
        message: `Cannot delete category. ${productsWithCategory} product(s) are using this.`,
      })
    }

    await category.deleteOne()
    res.json({ message: "Category deleted successfully" })
  } catch (error) {
    console.error("Error deleting category:", error)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router