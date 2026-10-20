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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          android_cert_sha256: string
          android_package_name: string
          currency: string
          id: boolean
          payment_recipient: string
          updated_at: string
          usage_timezone: string
          ussd_template: string
          whatsapp_number: string
        }
        Insert: {
          android_cert_sha256?: string
          android_package_name?: string
          currency?: string
          id?: boolean
          payment_recipient?: string
          updated_at?: string
          usage_timezone?: string
          ussd_template?: string
          whatsapp_number?: string
        }
        Update: {
          android_cert_sha256?: string
          android_package_name?: string
          currency?: string
          id?: boolean
          payment_recipient?: string
          updated_at?: string
          usage_timezone?: string
          ussd_template?: string
          whatsapp_number?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      auth_handoff_codes: {
        Row: {
          code_challenge: string
          code_hash: string
          created_at: string
          expires_at: string
          redirect_uri: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_challenge: string
          code_hash: string
          created_at?: string
          expires_at: string
          redirect_uri: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_challenge?: string
          code_hash?: string
          created_at?: string
          expires_at?: string
          redirect_uri?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          api_key: string
          client_code: string
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          api_key?: string
          client_code?: string
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          api_key?: string
          client_code?: string
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      daily_usage_summary: {
        Row: {
          client_id: string
          success_count: number
          usage_date: string
        }
        Insert: {
          client_id: string
          success_count?: number
          usage_date: string
        }
        Update: {
          client_id?: string
          success_count?: number
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_usage_summary_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          client_id: string
          created_at: string
          device_name: string | null
          id: string
          installation_id: string
          last_seen_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["device_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          device_name?: string | null
          id?: string
          installation_id: string
          last_seen_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["device_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          device_name?: string | null
          id?: string
          installation_id?: string
          last_seen_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["device_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          admin_note: string | null
          amount: number
          client_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["payment_request_kind"]
          payer_phone: string | null
          plan_id: string
          reference: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["review_status"]
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          client_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["payment_request_kind"]
          payer_phone?: string | null
          plan_id: string
          reference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          client_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["payment_request_kind"]
          payer_phone?: string | null
          plan_id?: string
          reference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          id: string
          note: string | null
          paid_at: string
          recorded_by: string | null
          subscription_id: string | null
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          id?: string
          note?: string | null
          paid_at?: string
          recorded_by?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          id?: string
          note?: string | null
          paid_at?: string
          recorded_by?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          daily_limit: number | null
          description: string
          duration_days: number
          id: string
          is_active: boolean
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number | null
          description?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          name: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_limit?: number | null
          description?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          expiry_date: string | null
          id: string
          notes: string | null
          plan_id: string
          price: number
          start_date: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          plan_id: string
          price?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          plan_id?: string
          price?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_records: {
        Row: {
          client_id: string
          created_at: string
          id: string
          subscription_id: string | null
          transaction_id: string
          usage_date: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          subscription_id?: string | null
          transaction_id: string
          usage_date: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          subscription_id?: string | null
          transaction_id?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_records_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      transaction_reservations: {
        Row: {
          attempt_id: string
          client_id: string
          created_at: string
          id: string
          installation_id: string
          outcome: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          subscription_id: string
          transaction_id: string
          usage_date: string
        }
        Insert: {
          attempt_id: string
          client_id: string
          created_at?: string
          id?: string
          installation_id: string
          outcome?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subscription_id: string
          transaction_id: string
          usage_date?: string
        }
        Update: {
          attempt_id?: string
          client_id?: string
          created_at?: string
          id?: string
          installation_id?: string
          outcome?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subscription_id?: string
          transaction_id?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_reservations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reservations_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _customer_client: {
        Args: never
        Returns: {
          api_key: string
          client_code: string
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "clients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _device_status: {
        Args: { _client_id: string; _installation_id: string }
        Returns: string
      }
      _payment_config: { Args: never; Returns: Json }
      _record_tx: {
        Args: { _client_id: string; _status: string; _transaction_id: string }
        Returns: Json
      }
      _sub_state: { Args: { _client_id: string }; Returns: Json }
      admin_activate_subscription: {
        Args: {
          _days?: number
          _payment_amount?: number
          _plan_id?: string
          _record_payment?: boolean
          _subscription_id: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          expiry_date: string | null
          id: string
          notes: string | null
          plan_id: string
          price: number
          start_date: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          is_admin: boolean
          user_id: string
        }[]
      }
      admin_review_device: {
        Args: { _approve: boolean; _device_id: string }
        Returns: {
          client_id: string
          created_at: string
          device_name: string | null
          id: string
          installation_id: string
          last_seen_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["device_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_review_payment: {
        Args: { _approve: boolean; _note?: string; _request_id: string }
        Returns: {
          admin_note: string | null
          amount: number
          client_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["payment_request_kind"]
          payer_phone: string | null
          plan_id: string
          reference: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["review_status"]
          subscription_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payment_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_rotate_api_key: { Args: { _client_id: string }; Returns: string }
      admin_set_admin: {
        Args: { _grant: boolean; _user_id: string }
        Returns: undefined
      }
      admin_set_suspended: {
        Args: { _subscription_id: string; _suspend: boolean }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          expiry_date: string | null
          id: string
          notes: string | null
          plan_id: string
          price: number
          start_date: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      api_check_subscription: {
        Args: { _api_key: string; _client_code: string }
        Returns: Json
      }
      api_get_plans: {
        Args: never
        Returns: {
          daily_limit: number
          description: string
          duration_days: number
          id: string
          name: string
          price: number
          unlimited: boolean
        }[]
      }
      api_record_transaction: {
        Args: {
          _api_key: string
          _client_code: string
          _status: string
          _transaction_id: string
        }
        Returns: Json
      }
      customer_record_transaction: {
        Args: {
          _installation_id: string
          _status: string
          _transaction_id: string
        }
        Returns: Json
      }
      customer_reserve_transaction: {
        Args: {
          _attempt_id: string
          _installation_id: string
          _transaction_id: string
        }
        Returns: Json
      }
      customer_finalize_transaction: {
        Args: {
          _installation_id: string
          _outcome: string
          _reservation_id: string
          _transaction_id: string
        }
        Returns: Json
      }
      admin_reconcile_transaction: {
        Args: { _outcome: string; _reservation_id: string }
        Returns: Json
      }
      admin_list_pending_transaction_reservations: {
        Args: { _limit?: number }
        Returns: Json
      }
      customer_register_device: {
        Args: { _device_name?: string; _installation_id: string }
        Returns: Json
      }
      customer_request_plan: {
        Args: { _payer_phone?: string; _plan_id: string; _reference?: string }
        Returns: Json
      }
      customer_status: { Args: { _installation_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      mark_expired_subscriptions: { Args: never; Returns: number }
      run_usage_retention: { Args: never; Returns: Json }
      usage_today: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin"
      device_status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED"
      payment_request_kind: "PURCHASE" | "RENEWAL" | "PLAN_CHANGE"
      review_status: "PENDING" | "APPROVED" | "REJECTED"
      subscription_status: "PENDING" | "ACTIVE" | "EXPIRED" | "SUSPENDED"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin"],
      device_status: ["PENDING", "APPROVED", "REJECTED", "REVOKED"],
      payment_request_kind: ["PURCHASE", "RENEWAL", "PLAN_CHANGE"],
      review_status: ["PENDING", "APPROVED", "REJECTED"],
      subscription_status: ["PENDING", "ACTIVE", "EXPIRED", "SUSPENDED"],
    },
  },
} as const
