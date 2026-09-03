/// <reference types="vite/client" />

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
