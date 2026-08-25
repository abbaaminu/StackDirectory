import { CodeFile } from '../types/directory';

export const CODE_FILES: CodeFile[] = [
  {
    filename: '01_schema.sql',
    filepath: 'supabase/migrations/01_schema.sql',
    language: 'sql',
    description: 'PostgreSQL database schema with RLS policies, indexes, and atomic upvote RPC function for Supabase.',
    code: `-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Pricing Type Enum
CREATE TYPE pricing_type_enum AS ENUM ('Free', 'Freemium', 'Paid', 'Open Source');

-- 3. Create 'tools' Table
CREATE TABLE IF NOT EXISTS public.tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    tagline VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    website_url VARCHAR(500) NOT NULL,
    pricing_type pricing_type_enum NOT NULL DEFAULT 'Freemium',
    category VARCHAR(100) NOT NULL DEFAULT 'Developer Tools',
    upvotes INTEGER NOT NULL DEFAULT 0,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    paddle_customer_id VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Create 'upvotes' Table (Prevents double-voting per user/fingerprint)
CREATE TABLE IF NOT EXISTS public.upvotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL, -- auth.uid() or client UUID fingerprint
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_tool_user_upvote UNIQUE (tool_id, user_id)
);

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_tools_is_approved ON public.tools(is_approved);
CREATE INDEX IF NOT EXISTS idx_tools_is_featured ON public.tools(is_featured);
CREATE INDEX IF NOT EXISTS idx_tools_upvotes ON public.tools(upvotes DESC);
CREATE INDEX IF NOT EXISTS idx_upvotes_tool_user ON public.upvotes(tool_id, user_id);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upvotes ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for 'tools'
-- Anyone can view approved tools
CREATE POLICY "Public tools are viewable by everyone" 
ON public.tools FOR SELECT 
USING (is_approved = TRUE);

-- Anyone can submit a new tool (defaults to is_approved = FALSE)
CREATE POLICY "Anyone can submit a tool" 
ON public.tools FOR INSERT 
WITH CHECK (
    is_approved = FALSE AND 
    is_featured = FALSE
);

-- 8. RLS Policies for 'upvotes'
-- Anyone can read upvotes to verify their voted status
CREATE POLICY "Upvotes viewable by everyone" 
ON public.upvotes FOR SELECT 
USING (TRUE);

-- Authenticated users or anonymous with client ID can insert an upvote
CREATE POLICY "Users can create upvotes" 
ON public.upvotes FOR INSERT 
WITH CHECK (TRUE);

-- 9. Atomic Stored Procedure to Toggle / Cast an Upvote
CREATE OR REPLACE FUNCTION public.toggle_tool_upvote(
    target_tool_id UUID,
    voter_id VARCHAR(255)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    voted BOOLEAN;
    new_count INTEGER;
BEGIN
    -- Check if vote already exists
    IF EXISTS (SELECT 1 FROM public.upvotes WHERE tool_id = target_tool_id AND user_id = voter_id) THEN
        -- Remove vote (unlike)
        DELETE FROM public.upvotes WHERE tool_id = target_tool_id AND user_id = voter_id;
        
        UPDATE public.tools 
        SET upvotes = GREATEST(0, upvotes - 1)
        WHERE id = target_tool_id
        RETURNING upvotes INTO new_count;
        
        voted := FALSE;
    ELSE
        -- Insert vote
        INSERT INTO public.upvotes (tool_id, user_id) 
        VALUES (target_tool_id, voter_id);
        
        UPDATE public.tools 
        SET upvotes = upvotes + 1
        WHERE id = target_tool_id
        RETURNING upvotes INTO new_count;
        
        voted := TRUE;
    END IF;

    RETURN jsonb_build_object(
        'voted', voted,
        'upvotes', new_count
    );
END;
$$;`
  },
  {
    filename: 'page.tsx',
    filepath: 'app/page.tsx',
    language: 'tsx',
    description: 'Next.js 14/15 App Router Server Component Homepage with Search, Filters, and Masonry/Grid Card Layout.',
    code: `import { Suspense } from 'react';
import { supabase } from '@/lib/supabase/client';
import { DirectoryHero } from '@/components/DirectoryHero';
import { DirectoryGrid } from '@/components/DirectoryGrid';
import { Tool } from '@/types/database';

export const revalidate = 60; // ISR revalidation every 60s

async function getApprovedTools(): Promise<Tool[]> {
  const { data, error } = await supabase
    .from('tools')
    .select('*')
    .eq('is_approved', true)
    .order('is_featured', { ascending: false })
    .order('upvotes', { ascending: false });

  if (error) {
    console.error('Error fetching tools from Supabase:', error);
    return [];
  }
  return data || [];
}

export default async function HomePage() {
  const initialTools = await getApprovedTools();

  return (
    <main className="min-h-screen bg-[#090a0f] text-zinc-100 selection:bg-amber-500/20 selection:text-amber-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <DirectoryHero totalCount={initialTools.length} />

        {/* Instant Search, Tag Filter & Masonry/Grid Client Section */}
        <Suspense fallback={<div className="text-zinc-500 py-12 text-center">Loading tools directory...</div>}>
          <DirectoryGrid initialTools={initialTools} />
        </Suspense>
      </div>
    </main>
  );
}`
  },
  {
    filename: 'route.ts',
    filepath: 'app/api/webhooks/paddle/route.ts',
    language: 'typescript',
    description: 'Next.js App Router Webhook Route Handler for Paddle. Verifies HMAC SHA-256 signature and upgrades tool.',
    code: `import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * Paddle Webhook Signature Verifier
 * Paddle signs webhooks using HMAC-SHA256 with header: paddle-signature: ts=...;h1=...
 */
function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | null,
  secretKey: string
): boolean {
  if (!signatureHeader || !secretKey) return false;

  try {
    const parts = signatureHeader.split(';');
    const tsPart = parts.find((p) => p.startsWith('ts='));
    const h1Part = parts.find((p) => p.startsWith('h1='));

    if (!tsPart || !h1Part) return false;

    const ts = tsPart.split('=')[1];
    const signature = h1Part.split('=')[1];
    const signedPayload = \`\${ts}:\${rawBody}\`;

    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(signedPayload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('paddle-signature');
    const secretKey = process.env.PADDLE_WEBHOOK_SECRET_KEY || '';

    // 1. Verify Paddle Webhook Signature
    const isValid = verifyPaddleSignature(rawBody, signature, secretKey);
    if (!isValid && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Invalid Paddle webhook signature' },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody);
    const { event_type, data } = payload;

    console.log(\`[Paddle Webhook] Received event: \${event_type}\`, {
      transactionId: data?.id,
      customerId: data?.customer_id,
    });

    // 2. Handle successful checkout / transaction event
    // In Paddle Billing v2: 'transaction.completed' or 'transaction.paid'
    if (event_type === 'transaction.completed' || event_type === 'transaction.paid') {
      const customData = data?.custom_data || {};
      const toolId = customData.tool_id;
      const customerId = data.customer_id;

      if (!toolId) {
        console.warn('[Paddle Webhook] Missing tool_id in custom_data payload.');
        return NextResponse.json(
          { message: 'Event ignored: No tool_id attached' },
          { status: 200 }
        );
      }

      // 3. Update Supabase with Admin Client (Bypasses RLS)
      // Instant Upgrade: is_featured = true AND is_approved = true
      const { data: updatedTool, error } = await supabaseAdmin
        .from('tools')
        .update({
          is_featured: true,
          is_approved: true,
          paddle_customer_id: customerId || null,
        })
        .eq('id', toolId)
        .select()
        .single();

      if (error) {
        console.error('[Paddle Webhook] Database update failed:', error);
        return NextResponse.json(
          { error: 'Failed to update tool listing' },
          { status: 500 }
        );
      }

      console.log(\`[Paddle Webhook] Successfully upgraded tool "\${updatedTool.name}" to Featured & Approved!\`);
      
      return NextResponse.json({
        success: true,
        message: 'Tool upgraded to featured tier successfully',
        tool_id: toolId,
      });
    }

    // Acknowledge other event types
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Paddle Webhook] Handler error:', error);
    return NextResponse.json(
      { error: 'Internal server error processing webhook' },
      { status: 500 }
    );
  }
}`
  },
  {
    filename: 'client.ts',
    filepath: 'lib/supabase/client.ts',
    language: 'typescript',
    description: 'Browser-safe Supabase client configured with Public Anon Key.',
    code: `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);`
  },
  {
    filename: 'server.ts',
    filepath: 'lib/supabase/server.ts',
    language: 'typescript',
    description: 'Server-side Supabase Admin Client using Service Role Key (Used in Paddle Webhook handler).',
    code: `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseServiceRoleKey && process.env.NODE_ENV === 'production') {
  console.warn('SUPABASE_SERVICE_ROLE_KEY is required for backend API routes.');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});`
  },
  {
    filename: 'database.ts',
    filepath: 'types/database.ts',
    language: 'typescript',
    description: 'TypeScript interfaces mapped directly to Supabase table definitions.',
    code: `export type PricingType = 'Free' | 'Freemium' | 'Paid' | 'Open Source';

export interface Tool {
  id: string;
  name: string;
  tagline: string;
  description: string;
  website_url: string;
  pricing_type: PricingType;
  category: string;
  upvotes: number;
  is_approved: boolean;
  is_featured: boolean;
  paddle_customer_id: string | null;
  created_at: string;
}

export interface Upvote {
  id: string;
  tool_id: string;
  user_id: string;
  created_at: string;
}

export interface SubmitToolPayload {
  name: string;
  tagline: string;
  description: string;
  website_url: string;
  pricing_type: PricingType;
  category: string;
}`
  },
  {
    filename: '.env.local.example',
    filepath: '.env.local.example',
    language: 'env',
    description: 'Environment variables required for Supabase & Paddle integration in Next.js.',
    code: `# Supabase Credentials (Found in Supabase Project Settings -> API)
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." # Secret: Keep server-side only

# Paddle Billing v2 Configuration
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN="live_..." # Or test_...
NEXT_PUBLIC_PADDLE_ENV="sandbox" # 'sandbox' or 'production'
PADDLE_API_KEY="pdl_..."
PADDLE_WEBHOOK_SECRET_KEY="pdl_ntf_set_..." # Found in Paddle Notifications / Webhooks settings
NEXT_PUBLIC_PADDLE_FEATURED_PRICE_ID="pri_01h..." # $49 one-time product price ID`
  }
];
