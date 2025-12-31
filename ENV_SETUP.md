# Environment Variables Setup

Create a `.env` file in the `backend` folder with the following content:

```env
# Supabase Configuration
# Get these from your Supabase project settings: https://app.supabase.com/project/_/settings/api

SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Server Configuration (optional, defaults to 3000)
PORT=3000
```

## How to get Supabase credentials:

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Select your project (or create a new one)
3. Go to Settings → API
4. Copy the following:
   - **Project URL** → Use as `SUPABASE_URL`
   - **anon/public key** → Use as `SUPABASE_ANON_KEY`

## For Vercel Deployment:

Add these environment variables in your Vercel project settings:
1. Go to your project in Vercel Dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add both `SUPABASE_URL` and `SUPABASE_ANON_KEY`
4. Redeploy your application

