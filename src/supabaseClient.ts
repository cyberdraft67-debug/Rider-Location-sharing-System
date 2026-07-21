/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || "https://jdsoyhjiyhceeavpdbeu.supabase.co";
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "sb_publishable_ptDvHDRfHF56qS9aLi-t_A_QOzL5_vy";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

