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

// Configure multer for image uploads (using memory storage for Supabase Storage)
const imageStorage = multer.memoryStorage();

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

// Configure multer for video uploads (using memory storage for Supabase Storage)
const videoStorage = multer.memoryStorage();

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
// Use service role key for storage operations if available (has admin access), otherwise use anon key
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  // Use service role key for server-side operations (has admin access to storage)
  supabase = createClient(supabaseUrl, supabaseServiceKey);
  console.log('✓ Supabase client initialized');
} else {
  console.log('⚠ Supabase credentials not found. API will work without database.');
}

// Middleware
app.use(cors());
app.use(express.json());

// Dynamic video serving endpoint for Vercel (files in /tmp)
// IMPORTANT: Place this BEFORE static middleware so it gets checked first
// This allows serving videos uploaded to /tmp on Vercel
app.get('/uploads/videos/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    
    // On Vercel, check /tmp/videos first, then fallback to temp folder
    const videoPaths = [];
    if (isVercel) {
      videoPaths.push(path.join('/tmp/videos', filename));
    }
    videoPaths.push(path.join(staticBaseDir, 'videos', filename));
    
    // Try to find the video file
    let videoPath = null;
    for (const testPath of videoPaths) {
      try {
        if (fs.existsSync(testPath)) {
          videoPath = testPath;
          break;
        }
      } catch (err) {
        // Continue to next path
        continue;
      }
    }
    
    if (!videoPath) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Get file stats
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      // Handle range requests for video streaming
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      // Send entire file
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error) {
    console.error('Error serving video:', error);
    res.status(500).json({ error: 'Error serving video', details: error.message });
  }
});

// Dynamic image serving endpoint for Vercel (files in /tmp)
// IMPORTANT: Place this BEFORE static middleware so it gets checked first
app.get('/uploads/products/:filename', (req, res, next) => {
  try {
    const filename = req.params.filename;
    
    // On Vercel, check /tmp/products first, then fallback to temp folder
    const imagePaths = [];
    if (isVercel) {
      imagePaths.push(path.join('/tmp/products', filename));
    }
    imagePaths.push(path.join(staticBaseDir, 'products', filename));
    
    // Try to find the image file
    let imagePath = null;
    for (const testPath of imagePaths) {
      try {
        if (fs.existsSync(testPath)) {
          imagePath = testPath;
          break;
        }
      } catch (err) {
        // Continue to next path
        continue;
      }
    }
    
    if (!imagePath) {
      // If not found, continue to static middleware (next())
      return next();
    }
    
    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    const contentTypeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    const contentType = contentTypeMap[ext] || 'image/jpeg';
    
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(imagePath).pipe(res);
  } catch (error) {
    console.error('Error serving image:', error);
    // Continue to static middleware on error
    next();
  }
});

// Serve uploaded files statically (fallback for files in temp folder)
// On Vercel: serve static files from 'temp' folder (pre-existing files in repo)
// Locally: serve from 'uploads' folder
app.use('/uploads', express.static(staticBaseDir));

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

// Admin Login endpoint
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password are required' 
      });
    }

    // Valid admin credentials
    const validEmail = 'biomedinnovationpharmaceutical@gmail.com';
    const validPassword = 'Imran@216216';

    // Check credentials
    if (email === validEmail && password === validPassword) {
      return res.json({ 
        success: true, 
        message: 'Login successful' 
      });
    } else {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Helper function to upload file to Supabase Storage
async function uploadToSupabaseStorage(file, bucket, folder = '') {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const fileExt = path.extname(file.originalname);
  const fileName = folder ? `${folder}/${uniqueSuffix}${fileExt}` : `${uniqueSuffix}${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (error) {
    // Provide helpful error messages
    if (error.message && error.message.includes('Bucket not found')) {
      throw new Error(`Bucket '${bucket}' not found. Please verify:
1. Bucket exists in Supabase Dashboard → Storage
2. Bucket name is exactly: ${bucket} (case-sensitive)
3. If using Anon Key, make sure storage policies are set
4. If bucket exists, try using SUPABASE_SERVICE_ROLE_KEY in .env file`);
    }
    
    // Handle permission errors
    if (error.message && (error.message.includes('permission') || error.message.includes('policy'))) {
      throw new Error(`Permission denied. Please check:
1. Storage policies are set for the '${bucket}' bucket
2. Or use SUPABASE_SERVICE_ROLE_KEY instead of SUPABASE_ANON_KEY
3. Service Role Key can be found in: Supabase Dashboard → Settings → API → service_role key`);
    }
    
    // Generic error
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return {
    path: data.path,
    publicUrl: urlData.publicUrl,
    fileName: fileName
  };
}

// Helper function to delete file from Supabase Storage
async function deleteFromSupabaseStorage(filePath, bucket) {
  if (!supabase || !filePath) {
    return;
  }

  try {
    // Extract path from URL if it's a full URL
    // Supabase Storage URLs format: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
    let pathToDelete = filePath;
    
    if (filePath.includes('/storage/v1/object/public/')) {
      // Extract path after bucket name
      const parts = filePath.split('/storage/v1/object/public/');
      if (parts.length > 1) {
        const afterPublic = parts[1];
        // Remove bucket name and leading slash
        const pathParts = afterPublic.split('/');
        if (pathParts[0] === bucket) {
          pathToDelete = pathParts.slice(1).join('/');
        } else {
          pathToDelete = afterPublic; // If bucket doesn't match, use as is
        }
      }
    } else if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      // Handle other URL formats - extract path from URL
      try {
        const url = new URL(filePath);
        pathToDelete = url.pathname.replace(`/storage/v1/object/public/${bucket}/`, '');
      } catch (e) {
        console.error('Error parsing URL:', e);
        return;
      }
    } else if (filePath.startsWith('/')) {
      // Remove leading slash if it's just a path
      pathToDelete = filePath.substring(1);
    }

    // Remove bucket prefix if present
    if (pathToDelete.startsWith(`${bucket}/`)) {
      pathToDelete = pathToDelete.substring(bucket.length + 1);
    }

    if (!pathToDelete || pathToDelete.trim() === '') {
      console.warn('Empty path to delete, skipping');
      return;
    }

    const { error } = await supabase.storage
      .from(bucket)
      .remove([pathToDelete]);

    if (error) {
      console.error('Error deleting file from Supabase Storage:', error);
    } else {
      console.log(`Successfully deleted file from storage: ${pathToDelete}`);
    }
  } catch (error) {
    console.error('Error deleting file from Supabase Storage:', error);
  }
}

// Upload single image
app.post('/api/upload/image', imageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Supabase is not configured' });
    }

    // Upload to Supabase Storage
    const uploadResult = await uploadToSupabaseStorage(req.file, 'products', 'images');
    
    res.json({
      message: 'Image uploaded successfully',
      imageUrl: uploadResult.publicUrl,
      filename: uploadResult.fileName,
      path: uploadResult.path
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Error uploading image', details: error.message });
  }
});

// Upload multiple images
app.post('/api/upload/images', imageUpload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files provided' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Supabase is not configured' });
    }

    // Upload all images to Supabase Storage
    const uploadPromises = req.files.map(file => uploadToSupabaseStorage(file, 'products', 'images'));
    const uploadResults = await Promise.all(uploadPromises);

    const imageUrls = uploadResults.map(result => ({
      url: result.publicUrl,
      filename: result.fileName,
      path: result.path
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
app.post('/api/upload/video', videoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Supabase is not configured' });
    }

    // Upload to Supabase Storage
    const uploadResult = await uploadToSupabaseStorage(req.file, 'products', 'videos');
    
    res.json({
      message: 'Video uploaded successfully',
      videoUrl: uploadResult.publicUrl,
      filename: uploadResult.fileName,
      path: uploadResult.path
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
      // First, fetch the product to get image and video paths
      const { data: product, error: fetchError } = await supabase
        .from('products')
        .select('image, images, video')
        .eq('id', id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching product for deletion:', fetchError);
      }

      // Delete files from Supabase Storage if product exists
      if (product) {
        // Delete main image
        if (product.image) {
          await deleteFromSupabaseStorage(product.image, 'products');
        }

        // Delete images array
        if (product.images && Array.isArray(product.images)) {
          for (const imageUrl of product.images) {
            await deleteFromSupabaseStorage(imageUrl, 'products');
          }
        }

        // Delete video
        if (product.video) {
          await deleteFromSupabaseStorage(product.video, 'products');
        }
      }

      // Delete product from database
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

// ==================== BANNERS API ENDPOINTS ====================

// Get all banners (for hero section)
app.get('/api/banners', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .eq('is_active', true)
        .order('order_index', { ascending: true });

      if (error) {
        console.error('Supabase error:', error);
        return res.json({ banners: [] });
      }

      return res.json({ banners: data || [] });
    } else {
      return res.json({ banners: [] });
    }
  } catch (error) {
    console.error('Error fetching banners:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all banners (including inactive - for admin)
app.get('/api/banners/all', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .order('order_index', { ascending: true });

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Failed to fetch banners', details: error.message });
      }

      return res.json({ banners: data || [] });
    } else {
      return res.json({ banners: [] });
    }
  } catch (error) {
    console.error('Error fetching banners:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new banner
app.post('/api/banners', async (req, res) => {
  try {
    const { image_url, title, subtitle, link, order_index, is_active } = req.body;

    if (!image_url) {
      return res.status(400).json({ error: 'Image URL is required' });
    }

    const newBanner = {
      image_url,
      title: title || null,
      subtitle: subtitle || null,
      link: link || null,
      order_index: order_index !== undefined ? parseInt(order_index) : 0,
      is_active: is_active !== undefined ? is_active : true
    };

    if (supabase) {
      const { data, error } = await supabase
        .from('banners')
        .insert([newBanner])
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Failed to create banner', details: error.message });
      }

      return res.status(201).json({ banner: data, message: 'Banner created successfully' });
    } else {
      return res.status(201).json({ banner: newBanner, message: 'Banner created successfully (not saved)' });
    }
  } catch (error) {
    console.error('Error creating banner:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a banner
app.put('/api/banners/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { image_url, title, subtitle, link, order_index, is_active } = req.body;

    const updateData = {};
    if (image_url !== undefined) updateData.image_url = image_url;
    if (title !== undefined) updateData.title = title;
    if (subtitle !== undefined) updateData.subtitle = subtitle;
    if (link !== undefined) updateData.link = link;
    if (order_index !== undefined) updateData.order_index = parseInt(order_index);
    if (is_active !== undefined) updateData.is_active = is_active;

    if (supabase) {
      const { data, error } = await supabase
        .from('banners')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Failed to update banner', details: error.message });
      }

      if (!data) {
        return res.status(404).json({ error: 'Banner not found' });
      }

      return res.json({ banner: data, message: 'Banner updated successfully' });
    } else {
      return res.json({ message: 'Banner updated successfully (not saved)' });
    }
  } catch (error) {
    console.error('Error updating banner:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a banner
app.delete('/api/banners/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (supabase) {
      // First, get the banner to delete the image from storage if needed
      const { data: banner, error: fetchError } = await supabase
        .from('banners')
        .select('image_url')
        .eq('id', id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching banner for deletion:', fetchError);
      }

      // Delete banner from database
      const { error } = await supabase
        .from('banners')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Failed to delete banner', details: error.message });
      }

      // Optionally delete image from storage (if it's in Supabase Storage)
      if (banner && banner.image_url) {
        await deleteFromSupabaseStorage(banner.image_url, 'products');
      }

      return res.json({ message: 'Banner deleted successfully' });
    } else {
      return res.json({ message: 'Banner deleted successfully (not saved)' });
    }
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== END BANNERS API ====================

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

