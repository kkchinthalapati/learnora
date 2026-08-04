import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";

export const profileApi = {
  async updateTimezone(timezone: string): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("profiles")
      .update({ timezone })
      .eq("id", userId);
    if (error) throw new Error(error.message);
  },
};
