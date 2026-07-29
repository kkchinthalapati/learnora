import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { WeeklyPlan } from "./types";

/* Direct port of js/api.js's `Plans` object (:963-1000). */
export const plansApi = {
  async fetchForWeek(weekStartISO: string): Promise<WeeklyPlan | null> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("weekly_plans")
      .select("*")
      .eq("user_id", userId)
      .eq("week_start", weekStartISO)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async upsert(weekStartISO: string, planJson: unknown): Promise<WeeklyPlan> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("weekly_plans")
      .upsert(
        [{ user_id: userId, week_start: weekStartISO, plan_json: planJson }],
        { onConflict: "user_id,week_start" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
};
