/// <reference types="vite/client" />

interface Window {
	Paddle?: {
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
