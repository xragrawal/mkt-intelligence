export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      collected_articles: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          keyword: string
          published_at: string | null
          publishing_agency: string | null
          title: string
          url: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id: string
          keyword: string
          published_at?: string | null
          publishing_agency?: string | null
          title: string
          url: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          keyword?: string
          published_at?: string | null
          publishing_agency?: string | null
          title?: string
          url?: string
        }
        Relationships: []
      }
      collection_runs: {
        Row: {
          articles_collected: number
          articles_stored: number
          completed_at: string | null
          id: string
          keywords: string[]
          last_published_at: string | null
          started_at: string
          status: string
        }
        Insert: {
          articles_collected?: number
          articles_stored?: number
          completed_at?: string | null
          id: string
          keywords: string[]
          last_published_at?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          articles_collected?: number
          articles_stored?: number
          completed_at?: string | null
          id?: string
          keywords?: string[]
          last_published_at?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      opportunity_packs: {
        Row: {
          article_source: string | null
          article_title: string
          article_url: string
          company_name: string | null
          created_at: string
          crm_ready_notes: string | null
          deployment_region: string | null
          event_type: string | null
          expansion_likelihood: string | null
          id: string
          inferred_industry: string | null
          likely_buyer_type: string | null
          maturity_signal: string | null
          notes: string | null
          opportunity_score: number | null
          partnership_angle: string | null
          raw_json: Json | null
          risk_factors: string | null
          scale_description: string | null
          status: string
          status_updated_at: string | null
          strategic_entry_point: string | null
          urgency_level: string | null
          why_this_is_hot: string | null
        }
        Insert: {
          article_source?: string | null
          article_title: string
          article_url: string
          company_name?: string | null
          created_at?: string
          crm_ready_notes?: string | null
          deployment_region?: string | null
          event_type?: string | null
          expansion_likelihood?: string | null
          id?: string
          inferred_industry?: string | null
          likely_buyer_type?: string | null
          maturity_signal?: string | null
          notes?: string | null
          opportunity_score?: number | null
          partnership_angle?: string | null
          raw_json?: Json | null
          risk_factors?: string | null
          scale_description?: string | null
          status?: string
          status_updated_at?: string | null
          strategic_entry_point?: string | null
          urgency_level?: string | null
          why_this_is_hot?: string | null
        }
        Update: {
          article_source?: string | null
          article_title?: string
          article_url?: string
          company_name?: string | null
          created_at?: string
          crm_ready_notes?: string | null
          deployment_region?: string | null
          event_type?: string | null
          expansion_likelihood?: string | null
          id?: string
          inferred_industry?: string | null
          likely_buyer_type?: string | null
          maturity_signal?: string | null
          notes?: string | null
          opportunity_score?: number | null
          partnership_angle?: string | null
          raw_json?: Json | null
          risk_factors?: string | null
          scale_description?: string | null
          status?: string
          status_updated_at?: string | null
          strategic_entry_point?: string | null
          urgency_level?: string | null
          why_this_is_hot?: string | null
        }
        Relationships: []
      }
      scored_articles: {
        Row: {
          article_id: string
          batch_id: string
          bd_impact_score: number | null
          buying_intent_score: number | null
          buying_intent_type: string | null
          city: string | null
          company: string | null
          confidence: string | null
          country: string | null
          created_at: string
          drop_reason: string | null
          id: string
          is_relevant: boolean
          lead_clarity_score: number | null
          partner_or_si: string | null
          source_quality_score: number | null
          units_mentioned: number | null
          why_it_matters: string | null
        }
        Insert: {
          article_id: string
          batch_id: string
          bd_impact_score?: number | null
          buying_intent_score?: number | null
          buying_intent_type?: string | null
          city?: string | null
          company?: string | null
          confidence?: string | null
          country?: string | null
          created_at?: string
          drop_reason?: string | null
          id?: string
          is_relevant?: boolean
          lead_clarity_score?: number | null
          partner_or_si?: string | null
          source_quality_score?: number | null
          units_mentioned?: number | null
          why_it_matters?: string | null
        }
        Update: {
          article_id?: string
          batch_id?: string
          bd_impact_score?: number | null
          buying_intent_score?: number | null
          buying_intent_type?: string | null
          city?: string | null
          company?: string | null
          confidence?: string | null
          country?: string | null
          created_at?: string
          drop_reason?: string | null
          id?: string
          is_relevant?: boolean
          lead_clarity_score?: number | null
          partner_or_si?: string | null
          source_quality_score?: number | null
          units_mentioned?: number | null
          why_it_matters?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
