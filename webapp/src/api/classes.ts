/* Classes: a teacher's class and a student's membership (migration
 * 20261028000000_class_misconception_map.sql). Behind the `classMap` flag.
 *
 * What each side can reach is decided by RLS and two security-definer
 * functions, not here: a teacher can read their own classes and two
 * aggregates, never a member or a ledger row; a student can read and change
 * only their own membership. */

import { supabase } from "../lib/supabase";
import type { MapRow, MemberCounts } from "../lib/classMap";
import { requireUserId } from "./session";

export interface TaughtClass {
  id: string;
  name: string;
  join_code: string;
  created_at: string;
}

export interface Membership {
  class_id: string;
  class_name: string;
  share_mistakes: boolean;
  joined_at: string;
}

export const classesApi = {
  /** Classes this account teaches. The member-read policy also lets a
   *  student see the classes they're in, so filter to the owner. */
  async taught(): Promise<TaughtClass[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("classes")
      .select("id, name, join_code, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as TaughtClass[];
  },

  async create(name: string): Promise<TaughtClass> {
    await requireUserId();
    const { data, error } = await supabase
      .from("classes")
      .insert({ name: name.trim() })
      .select("id, name, join_code, created_at")
      .single();
    if (error) throw error;
    return data as TaughtClass;
  },

  async remove(id: string): Promise<void> {
    await requireUserId();
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) throw error;
  },

  /** Classes this account has joined, with each class's name. */
  async memberships(): Promise<Membership[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("class_members")
      .select("class_id, share_mistakes, joined_at, classes(name)")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => {
      const row = r as unknown as {
        class_id: string;
        share_mistakes: boolean;
        joined_at: string;
        classes: { name: string } | { name: string }[] | null;
      };
      const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes;
      return {
        class_id: row.class_id,
        class_name: cls?.name ?? "A class",
        share_mistakes: row.share_mistakes,
        joined_at: row.joined_at,
      };
    });
  },

  /** Join by code. Null when no class has that code. Joining never turns
   *  sharing on; that is a separate choice. */
  async join(code: string): Promise<{ class_id: string; class_name: string } | null> {
    await requireUserId();
    const { data, error } = await supabase.rpc("join_class", { p_code: code });
    if (error) throw error;
    const rows = (data ?? []) as { class_id: string; class_name: string }[];
    return rows[0] ?? null;
  },

  async setShare(classId: string, share: boolean): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("class_members")
      .update({ share_mistakes: share })
      .eq("class_id", classId)
      .eq("user_id", userId);
    if (error) throw error;
  },

  async leave(classId: string): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("class_members")
      .delete()
      .eq("class_id", classId)
      .eq("user_id", userId);
    if (error) throw error;
  },

  async counts(classId: string): Promise<MemberCounts> {
    await requireUserId();
    const { data, error } = await supabase.rpc("class_member_counts", { p_class: classId });
    if (error) throw error;
    const row = ((data ?? []) as MemberCounts[])[0];
    return { joined: row?.joined ?? 0, sharing: row?.sharing ?? 0 };
  },

  async map(classId: string): Promise<MapRow[]> {
    await requireUserId();
    const { data, error } = await supabase.rpc("class_misconception_map", { p_class: classId });
    if (error) throw error;
    return (data ?? []) as MapRow[];
  },
};
