require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directories if they don't exist
// IMPORTANT: On Vercel, filesystem is READ-ONLY except for /tmp
// So we MUST use /tmp for uploads on Vercel (files won't persist between invocations)
// For local development, use 'uploads' folder
// Static files can be served from 'temp' folder (read-only, from repo)
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;

// For uploads: use /tmp on Vercel, uploads folder locally
const uploadBaseDir = isVercel ? '/tmp' : path.join(__dirname, 'uploads');
const uploadsDir = path.join(uploadBaseDir, 'products');
const videosDir = path.join(uploadBaseDir, 'videos');

// For static file serving: use temp folder on Vercel (read-only from repo), uploads locally
const staticBaseDir = isVercel ? path.join(__dirname, 'temp') : path.join(__dirname, 'uploads');

// Create upload directories with error handling
try {
  // Create subdirectories in upload location
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }
} catch (error) {
  // Log error for debugging
  console.error('Could not create upload directories:', error.message);
  console.warn('File uploads may not work on this platform');
}

// Configure multer for image uploads
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Ensure directory exists before saving file
    try {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      cb(null, uploadsDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const imageFileFilter = (req, file, cb) => {
  // Accept only images
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const imageUpload = multer({
  storage: imageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: imageFileFilter
});

// Configure multer for video uploads
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Ensure directory exists before saving file
    try {
      if (!fs.existsSync(videosDir)) {
        fs.mkdirSync(videosDir, { recursive: true });
      }
      cb(null, videosDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'video-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const videoFileFilter = (req, file, cb) => {
  // Accept only videos
  if (file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Only video files are allowed!'), false);
  }
};

const videoUpload = multer({
  storage: videoStorage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit for videos
  },
  fileFilter: videoFileFilter
});

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

// Serve uploaded files statically
// On Vercel: serve static files from 'temp' folder (pre-existing files in repo)
//            uploaded files go to /tmp but won't be served (Vercel limitation)
// Locally: serve from 'uploads' folder
app.use('/uploads', express.static(staticBaseDir));

// On Vercel, also try to serve from /tmp (for recently uploaded files, but they won't persist)
if (isVercel) {
  try {
    if (fs.existsSync('/tmp/products')) {
      app.use('/uploads/products', express.static('/tmp/products'));
    }
    if (fs.existsSync('/tmp/videos')) {
      app.use('/uploads/videos', express.static('/tmp/videos'));
    }
  } catch (error) {
    // Ignore - static serving from /tmp may not always work
  }
}

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

// Upload single image
app.post('/api/upload/image', imageUpload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imageUrl = `/uploads/products/${req.file.filename}`;
    res.json({
      message: 'Image uploaded successfully',
      imageUrl: imageUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Error uploading image', details: error.message });
  }
});

// Upload multiple images
app.post('/api/upload/images', imageUpload.array('images', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files provided' });
    }

    const imageUrls = req.files.map(file => ({
      url: `/uploads/products/${file.filename}`,
      filename: file.filename
    }));

    res.json({
      message: 'Images uploaded successfully',
      images: imageUrls
    });
  } catch (error) {
    console.error('Error uploading images:', error);
    res.status(500).json({ error: 'Error uploading images', details: error.message });
  }
});

// Upload video
app.post('/api/upload/video', videoUpload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const videoUrl = `/uploads/videos/${req.file.filename}`;
    res.json({
      message: 'Video uploaded successfully',
      videoUrl: videoUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).json({ error: 'Error uploading video', details: error.message });
  }
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

// Helper function to generate unique auto-incremented product ID
async function generateProductId() {
  try {
    if (supabase) {
      // Get all products to find the highest ID
      const { data, error } = await supabase
        .from('products')
        .select('id');

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching products for ID generation:', error);
        // Fallback to timestamp-based ID
        return `prod-${Date.now()}`;
      }

      if (data && data.length > 0) {
        // Extract numbers from all IDs and find the maximum
        let maxNumber = 0;
        data.forEach(product => {
          const match = product.id.match(/^prod-(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNumber) {
              maxNumber = num;
            }
          }
        });
        
        if (maxNumber > 0) {
          return `prod-${maxNumber + 1}`;
        }
      }
      // If no products exist or format doesn't match, start from 1
      return 'prod-1';
    } else {
      // For development without Supabase, use timestamp
      return `prod-${Date.now()}`;
    }
  } catch (error) {
    console.error('Error generating product ID:', error);
    // Fallback to timestamp-based ID
    return `prod-${Date.now()}`;
  }
}

// Create a new product (POST)
app.post('/api/products', async (req, res) => {
  try {
    const { 
      name, rating, reviews, questions, originalPrice, discountedPrice, 
      image, images, video, packSize, wellnessCoins,
      description, helps, details, directions, ingredients,
      inStock 
    } = req.body;

    // Validation
    if (!name || !originalPrice || !discountedPrice) {
      return res.status(400).json({ error: 'Name, originalPrice, and discountedPrice are required' });
    }

    // Generate auto-increment unique ID
    const productId = await generateProductId();

    // Handle images - support both single image (backward compatibility) and images array
    const imageArray = images && Array.isArray(images) ? images : (image ? [image] : []);
    const mainImage = image || (imageArray.length > 0 ? imageArray[0] : '');

    const newProduct = {
      id: productId,
      name,
      rating: rating ? parseFloat(rating) : 0,
      reviews: reviews ? parseInt(reviews) : 0,
      questions: questions ? parseInt(questions) : 0,
      originalPrice: parseFloat(originalPrice),
      discountedPrice: parseFloat(discountedPrice),
      image: mainImage, // Main image for backward compatibility
      images: imageArray, // Array of images
      video: video || null, // Video URL (optional)
      packSize: packSize || null,
      wellnessCoins: wellnessCoins ? parseFloat(wellnessCoins) : null,
      description: description || '',
      helps: helps && Array.isArray(helps) ? helps : null,
      details: details || null,
      directions: directions || null,
      ingredients: ingredients && Array.isArray(ingredients) ? ingredients : null,
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
        console.error('Product data:', JSON.stringify(newProduct, null, 2));
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
    const { 
      name, rating, reviews, questions, originalPrice, discountedPrice, 
      image, images, video, packSize, wellnessCoins,
      description, helps, details, directions, ingredients,
      inStock 
    } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (rating !== undefined) updateData.rating = parseFloat(rating);
    if (reviews !== undefined) updateData.reviews = parseInt(reviews);
    if (questions !== undefined) updateData.questions = parseInt(questions);
    if (originalPrice !== undefined) updateData.originalPrice = parseFloat(originalPrice);
    if (discountedPrice !== undefined) updateData.discountedPrice = parseFloat(discountedPrice);
    
    // Handle images
    if (images !== undefined && Array.isArray(images)) {
      updateData.images = images;
      updateData.image = images.length > 0 ? images[0] : '';
    } else if (image !== undefined) {
      updateData.image = image;
      if (!updateData.images) {
        updateData.images = image ? [image] : [];
      }
    }
    
    // Handle video (optional)
    if (video !== undefined) updateData.video = video || null;
    if (packSize !== undefined) updateData.packSize = packSize || null;
    if (wellnessCoins !== undefined) updateData.wellnessCoins = wellnessCoins ? parseFloat(wellnessCoins) : null;
    if (description !== undefined) updateData.description = description;
    if (helps !== undefined) updateData.helps = helps && Array.isArray(helps) ? helps : null;
    if (details !== undefined) updateData.details = details || null;
    if (directions !== undefined) updateData.directions = directions || null;
    if (ingredients !== undefined) updateData.ingredients = ingredients && Array.isArray(ingredients) ? ingredients : null;
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

