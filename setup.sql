-- Create products table in Supabase
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rating DECIMAL(3, 1),
  reviews INTEGER DEFAULT 0,
  originalPrice DECIMAL(10, 2),
  discountedPrice DECIMAL(10, 2),
  image TEXT,
  description TEXT,
  inStock BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access
CREATE POLICY "Allow public read access" ON products
  FOR SELECT USING (true);

-- Optional: Insert some sample data
INSERT INTO products (id, name, rating, reviews, "originalPrice", "discountedPrice", image, description, "inStock") VALUES
('prod-1', 'Magnesium Glycinate | Magnizen', 4.5, 120, 4500, 3500, '/assets/products/main-product.jpeg', 'Calm the mind by supporting the nervous system. Relax muscles and nerves to promote restful sleep. Provide optimal support with its highly absorbable and gentle form.', true),
('prod-2', 'Vanur Men', 4.8, 89, 2000, 1650, '/assets/products/product-1.jpeg', 'Calm the mind by supporting the nervous system. Relax muscles and nerves to promote restful sleep. Provide optimal support with its highly absorbable and gentle form.', true),
('prod-3', 'Vanur Women', 4.6, 156, 1800, 1500, '/assets/products/product-2.jpeg', 'Calm the mind by supporting the nervous system. Relax muscles and nerves to promote restful sleep. Provide optimal support with its highly absorbable and gentle form.', true),
('prod-4', 'Certeza BM-405 Digital Blood Pressure Monitor', 4.7, 245, 6500, 5950, '/assets/products/other-product/Certeza-1.webp', 'Accurately measures blood pressure and pulse on the arm. Features a soft cuff material for added comfort. Includes a hypertension indicator and an irregular heartbeat detector.', true)
ON CONFLICT (id) DO NOTHING;

