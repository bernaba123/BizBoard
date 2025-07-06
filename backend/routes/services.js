import express from 'express';
import Service from '../models/Service.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Get all services for authenticated user
router.get('/', protect, async (req, res) => {
  try {
    const services = await Service.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({
      success: true,
      count: services.length,
      services
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get single service
router.get('/:id', protect, async (req, res) => {
  try {
    const service = await Service.findOne({ _id: req.params.id, userId: req.user.id });
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.json({
      success: true,
      service
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Create new service
router.post('/', protect, async (req, res) => {
  try {
    const { name, description, price, duration, category } = req.body;
    
    const service = await Service.create({
      userId: req.user.id,
      name,
      description,
      price,
      duration,
      category
    });

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      service
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update service
router.put('/:id', protect, async (req, res) => {
  try {
    const { name, description, price, duration, category, isActive } = req.body;

    const service = await Service.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { name, description, price, duration, category, isActive },
      { new: true, runValidators: true }
    );

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    res.json({
      success: true,
      message: 'Service updated successfully',
      service
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete service
router.delete('/:id', protect, async (req, res) => {
  try {
    const service = await Service.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.json({
      success: true,
      message: 'Service deleted successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;