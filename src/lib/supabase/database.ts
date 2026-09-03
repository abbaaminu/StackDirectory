export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      tools: {
        Row: {
          id: string;
          name: string;
          tagline: string;
          description: string;
          website_url: string;
          pricing_type: "Free" | "Freemium" | "Paid" | "Open Source";
          category: string;
          upvotes: number;
          is_approved: boolean;
          is_featured: boolean;
          status: "pending" | "approved" | "rejected";
          paddle_customer_id: string | null;
          is_for_sale: boolean;
          asking_price: number | null;
          monthly_revenue: number;
          monthly_profit: number;
          seller_contact: string | null;
          tech_stack: string[];
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tools"]["Row"],
          "id" | "created_at" | "status"
        > & {
          id?: string;
          created_at?: string;
          status?: "pending" | "approved" | "rejected";
        };
        Update: Partial<Database["public"]["Tables"]["tools"]["Insert"]>;
      };
      upvotes: {
        Row: {
          id: string;
          tool_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tool_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["upvotes"]["Insert"]>;
      };
      acquisition_offers: {
        Row: {
          id: string;
          tool_id: string;
          buyer_name: string;
          buyer_email: string;
          offer_amount: number;
          message: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tool_id: string;
          buyer_name: string;
          buyer_email: string;
          offer_amount: number;
          message?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["acquisition_offers"]["Insert"]
        >;
      };
    };
    Functions: {
      toggle_tool_upvote: {
        Args: {
          target_tool_id: string;
          voter_id: string;
        };
        Returns: {
          voted: boolean;
          upvotes: number;
        };
      };
    };
  };
}
