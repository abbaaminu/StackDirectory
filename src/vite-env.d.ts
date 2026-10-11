/// <reference types="vite/client" />

/**
 * Client-exposed environment variables.
 *
 * Vite only inlines variables prefixed with `VITE_` into the browser bundle —
 * the Vite equivalent of the Next.js `NEXT_PUBLIC_` prefix. Keep this list in
 * sync with `.env.example`.
 *
 * Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `PADDLE_API_KEY`,
 * `PADDLE_WEBHOOK_SECRET_KEY`, `RESEND_API_KEY`, `APP_URL`) are read with
 * `process.env` inside `api/` and must never be declared here.
 */
interface ImportMetaEnv {
	/** Supabase project URL (public). */
	readonly VITE_SUPABASE_URL?: string;
	/** Supabase anon key (public; Row Level Security enforces access). */
	readonly VITE_SUPABASE_ANON_KEY?: string;
	/** Paddle.js v2 client-side token. */
	readonly VITE_PADDLE_CLIENT_TOKEN?: string;
	/** 'sandbox' or 'production' — informational; the SDK reads it from the token. */
	readonly VITE_PADDLE_ENV?: string;
	/** $5 Featured Listing one-time price id. */
	readonly VITE_PADDLE_PRICE_ID?: string;
	/** Comma-separated admin allow-list, e.g. "you@example.com,partner@example.com". */
	readonly VITE_ADMIN_EMAILS?: string;
	/** Single-admin fallback for VITE_ADMIN_EMAILS. */
	readonly VITE_ADMIN_EMAIL?: string;
}

interface Window {
	Paddle?: {
		Initialize: (options: {
			token: string;
			eventCallback?: (event: { event_type?: string }) => void;
		}) => void;
		Checkout: {
			open: (options: {
				items: Array<{ priceId: string; quantity: number }>;
				customer?: { email: string };
				customData: Record<string, string>;
				settings?: { displayMode: "overlay" };
			}) => void;
		};
	};
}
