/**
 * =============================================================================
 * TEMPORARY TYPE SCAFFOLD - NOT GENERATED FROM A LIVE SUPABASE PROJECT
 * =============================================================================
 *
 * ClientFlow has no Supabase project linked yet (Phase 0), so the Supabase CLI
 * could not generate this file. It is hand-written to match
 * `supabase/migrations/20260921000000_init_clientflow_schema.sql` and exists so
 * that `createBrowserClient<Database>()` / `createServerClient<Database>()` are
 * type-safe today.
 *
 * DO NOT treat this file as the source of truth. As soon as a real project is
 * linked, replace it with the generated output:
 *
 *   npx supabase link --project-ref <project-ref>
 *   npx supabase gen types typescript --linked --schema public > src/types/database.ts
 *
 * Any schema change must be reflected here (or regenerated) in the same commit;
 * the shape below mirrors what `supabase gen types` emits so the swap is
 * mechanical.
 * =============================================================================
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** `public.project_status` enum. */
export type ProjectStatus = "planning" | "in_progress" | "on_hold" | "completed" | "cancelled";

/** `public.task_status` enum. */
export type TaskStatus = "todo" | "in_progress" | "done";

/** `public.task_priority` enum. */
export type TaskPriority = "low" | "medium" | "high";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          email: string;
          full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          /** Tenant owner. Must equal `auth.uid()` (enforced by RLS). */
          user_id: string;
          email: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          email?: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          company: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          /** Tenant owner. Must equal `auth.uid()` (enforced by RLS). */
          user_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          company?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          company?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          client_id: string;
          name: string;
          description: string | null;
          status: ProjectStatus;
          value: number;
          start_date: string | null;
          due_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          /** Tenant owner. Must equal `auth.uid()` (enforced by RLS). */
          user_id: string;
          /** Must reference a client owned by the same `user_id` (composite FK). */
          client_id: string;
          name: string;
          description?: string | null;
          status?: ProjectStatus;
          value?: number;
          start_date?: string | null;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string;
          name?: string;
          description?: string | null;
          status?: ProjectStatus;
          value?: number;
          start_date?: string | null;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_client_tenant_fkey";
            columns: ["client_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          title: string;
          description: string | null;
          status: TaskStatus;
          priority: TaskPriority;
          due_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          /** Tenant owner. Must equal `auth.uid()` (enforced by RLS). */
          user_id: string;
          /** Must reference a project owned by the same `user_id` (composite FK). */
          project_id: string;
          title: string;
          description?: string | null;
          status?: TaskStatus;
          priority?: TaskPriority;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string;
          title?: string;
          description?: string | null;
          status?: TaskStatus;
          priority?: TaskPriority;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_project_tenant_fkey";
            columns: ["project_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      project_status: ProjectStatus;
      task_status: TaskStatus;
      task_priority: TaskPriority;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

/** Convenience aliases used by application code and tests. */
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
export type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
export type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
export type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
