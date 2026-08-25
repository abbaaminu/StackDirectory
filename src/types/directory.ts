export type PricingType = 'Free' | 'Freemium' | 'Paid' | 'Open Source';

export interface Tool {
  id: string;
  name: string;
  tagline: string;
  description: string;
  website_url: string;
  icon_url?: string;
  pricing_type: PricingType;
  category: string;
  upvotes: number;
  is_approved: boolean;
  is_featured: boolean;
  paddle_customer_id?: string | null;
  created_at: string;
  user_has_upvoted?: boolean;
}

export interface UpvoteRecord {
  id: string;
  tool_id: string;
  user_id: string;
  created_at: string;
}

export interface SubmissionFormState {
  name: string;
  tagline: string;
  description: string;
  website_url: string;
  category: string;
  pricing_type: PricingType;
  tier: 'free' | 'paddle_featured';
  customer_email?: string;
}

export interface PaddleWebhookPayload {
  event_id: string;
  event_type: 'transaction.completed' | 'transaction.created' | 'subscription.created';
  occurred_at: string;
  data: {
    id: string;
    status: string;
    customer_id: string;
    custom_data?: {
      tool_id: string;
      plan_type?: string;
      submitted_by?: string;
    };
    details?: {
      totals: {
        total: string;
        currency_code: string;
      };
    };
  };
}

export interface CodeFile {
  filename: string;
  filepath: string;
  language: 'sql' | 'typescript' | 'tsx' | 'bash' | 'env';
  description: string;
  code: string;
}
