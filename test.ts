import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jdsoyhjiyhceeavpdbeu.supabase.co";
const supabaseAnonKey = "sb_publishable_ptDvHDRfHF56qS9aLi-t_A_QOzL5_vy";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data, error } = await supabase
    .from("tracking_links")
    .select("*")
    .limit(1);
  if (error) {
    console.error("Error fetching tracking links:", error);
  } else {
    console.log("Columns in tracking_links:", Object.keys(data[0] || {}));
  }
}

test();
