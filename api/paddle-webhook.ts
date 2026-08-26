import { createClient } from '@supabase/supabase-js';
import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Paddle Webhook Handler — Vercel Serverless Function
 *
 * Endpoint: POST /api/paddle-webhook
 *
 * On a `transaction.completed` event, reads `custom_data.tool_id` (or the
 * top-level `tool_id`) passed at checkout time and upgrades that tool in
 * Supabase to `is_approved = true` and `is_featured = true`.
 *
 * Uses the SUPABASE_SERVICE_ROLE_KEY (server-side secret) so it bypasses
 * Row Level Security. Never expose this key to the browser/vite runtime.
 */

type PaddleWebhookPayload = {
  event_type: string;
  data?: {
    id?: string;
    status?: string;
    customer_id?: string;
    custom_data?: {
      tool_id?: string;
      plan_type?: string;
      submitted_by?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      // Guard against extremely large payloads (max ~1MB)
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  // Only accept POST requests from Paddle
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
    return;
  }

  try {
    // 1. Parse raw JSON body
    const rawBody = await collectBody(req);
    const payload: PaddleWebhookPayload = JSON.parse(rawBody || '{}');

    const { event_type, data } = payload;

    // 2. Only handle successful (completed) transactions
    if (event_type !== 'transaction.completed') {
      console.log(
        `[Paddle Webhook] Ignored non-completed event: ${event_type ?? '(missing)'}`
      );
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // 3. Extract the tool_id from custom_data (or fall back to top-level tool_id)
    const customData = data?.custom_data ?? {};
    const toolId = customData.tool_id ?? (data as Record<string, unknown>)?.tool_id;
    const customerId = data?.customer_id ?? null;

    if (!toolId) {
      console.warn('[Paddle Webhook] Missing tool_id in custom_data payload.');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // 4. Build a server-side Supabase admin client using the Service Role Key
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        '[Paddle Webhook] Missing SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_URL environment variables.'
      );
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({ success: false, error: 'Server is not configured for webhook upgrades.' })
      );
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 5. Update the tool: approve + feature it (bypasses RLS via service role)
    const { error } = await supabaseAdmin
      .from('tools')
      .update({
        is_approved: true,
        is_featured: true,
        paddle_customer_id: typeof customerId === 'string' ? customerId : null,
      } as never)
      .eq('id', toolId);

    if (error) {
      console.error('[Paddle Webhook] Database update failed:', error.message);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({ success: false, error: 'Failed to update tool listing.' })
      );
      return;
    }

    console.log(
      `[Paddle Webhook] Successfully upgraded tool "${toolId}" to Featured & Approved.`
    );

    // 6. Return success JSON
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true }));
  } catch (err) {
    console.error('[Paddle Webhook] Handler error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({ success: false, error: 'Internal server error processing webhook.' })
    );
  }
}
