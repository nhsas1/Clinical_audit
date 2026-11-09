import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function readTable<T>(table: string, query = '*'): Promise<T[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from(table).select(query);
  if (error) throw error;
  return (data ?? []) as T[];
}
