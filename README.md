# Biomed Backend API

Node.js/Express backend with Supabase integration for the Biomed Pharmacy web application.

## Features

- ✅ Express.js REST API
- ✅ Supabase database integration
- ✅ CORS enabled for frontend integration
- ✅ Test endpoints for health checks
- ✅ Products API endpoints
- ✅ Vercel deployment ready

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Supabase

1. Create a project at [Supabase](https://app.supabase.com/)
2. Get your project URL and anon key from Settings → API
3. Create a `.env` file in the backend folder:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
PORT=3000
```

You can copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

### 3. Create Products Table in Supabase

Run this SQL in your Supabase SQL Editor:

```sql
CREATE TABLE products (
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

-- Enable Row Level Security (optional, for now we'll use anon key)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access
CREATE POLICY "Allow public read access" ON products
  FOR SELECT USING (true);
```

### 4. Run Locally

```bash
npm start
```

The server will run on `http://localhost:3000`

## API Endpoints

### Health Check
```
GET /api/health
```

### Test Endpoint
```
GET /api/test
```

### Get All Products
```
GET /api/products
```

### Get Single Product
```
GET /api/products/:id
```

## Deployment to Vercel

### 1. Install Vercel CLI (if not installed)
```bash
npm install -g vercel
```

### 2. Deploy
```bash
cd backend
vercel
```

Follow the prompts and make sure to:
- Link to your existing Vercel project or create a new one
- Add environment variables in Vercel dashboard:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

### 3. Set Environment Variables in Vercel

1. Go to your project in Vercel Dashboard
2. Navigate to Settings → Environment Variables
3. Add:
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_ANON_KEY` = your Supabase anon key

### 4. Redeploy

After adding environment variables, redeploy your function or wait for the next deployment.

## Notes

- The API will work with mock data if Supabase is not configured
- Make sure CORS is enabled for your frontend domain
- All endpoints return JSON responses
- The API is ready to be extended with more endpoints as needed

