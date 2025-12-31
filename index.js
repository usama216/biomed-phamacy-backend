require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✓ Supabase client initialized');
} else {
  console.log('⚠ Supabase credentials not found. API will work without database.');
}

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Biomed Backend API is running',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Backend API is working!',
    data: {
      server: 'Express.js',
      database: supabase ? 'Supabase Connected' : 'Supabase Not Configured',
      timestamp: new Date().toISOString()
    }
  });
});

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    if (supabase) {
      // Try to fetch from Supabase
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('id', { ascending: true });

      if (error) {
        console.error('Supabase error:', error);
        // Fallback to mock data if table doesn't exist yet
        return res.json({ products: getMockProducts() });
      }

      return res.json({ products: data || [] });
    } else {
      // Return mock data if Supabase is not configured
      return res.json({ products: getMockProducts() });
    }
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single product by ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (supabase) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Supabase error:', error);
        // Fallback to mock data
        const product = getMockProducts().find(p => p.id === id);
        if (!product) {
          return res.status(404).json({ error: 'Product not found' });
        }
        return res.json({ product });
      }

      if (!data) {
        return res.status(404).json({ error: 'Product not found' });
      }

      return res.json({ product: data });
    } else {
      // Return mock data
      const product = getMockProducts().find(p => p.id === id);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      return res.json({ product });
    }
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new product (POST)
app.post('/api/products', async (req, res) => {
  try {
    const { id, name, rating, reviews, originalPrice, discountedPrice, image, description, inStock } = req.body;

    // Validation
    if (!name || !originalPrice || !discountedPrice) {
      return res.status(400).json({ error: 'Name, originalPrice, and discountedPrice are required' });
    }

    const newProduct = {
      id: id || `prod-${Date.now()}`,
      name,
      rating: rating || 0,
      reviews: reviews || 0,
      originalPrice: parseFloat(originalPrice),
      discountedPrice: parseFloat(discountedPrice),
      image: image || '',
      description: description || '',
      inStock: inStock !== undefined ? inStock : true
    };

    if (supabase) {
      const { data, error } = await supabase
        .from('products')
        .insert([newProduct])
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Failed to create product', details: error.message });
      }

      return res.status(201).json({ product: data, message: 'Product created successfully' });
    } else {
      // In-memory storage for development (without Supabase)
      // Note: This is temporary - data will be lost on server restart
      return res.status(201).json({ product: newProduct, message: 'Product created successfully (stored in memory)' });
    }
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a product (PUT)
app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, rating, reviews, originalPrice, discountedPrice, image, description, inStock } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (rating !== undefined) updateData.rating = parseFloat(rating);
    if (reviews !== undefined) updateData.reviews = parseInt(reviews);
    if (originalPrice !== undefined) updateData.originalPrice = parseFloat(originalPrice);
    if (discountedPrice !== undefined) updateData.discountedPrice = parseFloat(discountedPrice);
    if (image !== undefined) updateData.image = image;
    if (description !== undefined) updateData.description = description;
    if (inStock !== undefined) updateData.inStock = inStock;

    if (supabase) {
      const { data, error } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Failed to update product', details: error.message });
      }

      if (!data) {
        return res.status(404).json({ error: 'Product not found' });
      }

      return res.json({ product: data, message: 'Product updated successfully' });
    } else {
      // For development without Supabase - return updated data structure
      return res.json({ product: { id, ...updateData }, message: 'Product updated successfully (in memory)' });
    }
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a product (DELETE)
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (supabase) {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Failed to delete product', details: error.message });
      }

      return res.json({ message: 'Product deleted successfully' });
    } else {
      // For development without Supabase
      return res.json({ message: 'Product deleted successfully (from memory)' });
    }
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mock products data (fallback when Supabase is not configured or table doesn't exist)
function getMockProducts() {
  return [
    {
      id: 'prod-1',
      name: 'Magnesium Glycinate | Magnizen',
      rating: 4.5,
      reviews: 120,
      originalPrice: 4500,
      discountedPrice: 3500,
      image: '/assets/products/main-product.jpeg',
      description: 'Calm the mind by supporting the nervous system. Relax muscles and nerves to promote restful sleep. Provide optimal support with its highly absorbable and gentle form.',
      inStock: true
    },
    {
      id: 'prod-2',
      name: 'Vanur Men',
      rating: 4.8,
      reviews: 89,
      originalPrice: 2000,
      discountedPrice: 1650,
      image: '/assets/products/product-1.jpeg',
      description: 'Calm the mind by supporting the nervous system. Relax muscles and nerves to promote restful sleep. Provide optimal support with its highly absorbable and gentle form.',
      inStock: true
    },
    {
      id: 'prod-3',
      name: 'Vanur Women',
      rating: 4.6,
      reviews: 156,
      originalPrice: 1800,
      discountedPrice: 1500,
      image: '/assets/products/product-2.jpeg',
      description: 'Calm the mind by supporting the nervous system. Relax muscles and nerves to promote restful sleep. Provide optimal support with its highly absorbable and gentle form.',
      inStock: true
    },
    {
      id: 'prod-4',
      name: 'Certeza BM-405 Digital Blood Pressure Monitor',
      rating: 4.7,
      reviews: 245,
      originalPrice: 6500,
      discountedPrice: 5950,
      image: '/assets/products/other-product/Certeza-1.webp',
      description: 'Accurately measures blood pressure and pulse on the arm. Features a soft cuff material for added comfort. Includes a hypertension indicator and an irregular heartbeat detector.',
      inStock: true
    }
  ];
}

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test`);
    console.log(`📦 Products endpoint: http://localhost:${PORT}/api/products`);
  });
}

// Export for Vercel
module.exports = app;

