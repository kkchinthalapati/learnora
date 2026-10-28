import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MISCONCEPTION_CATALOGUE } from "./misconceptionCatalogue";
import {
  classMapState,
  isJoinCode,
  MIN_CELL,
  MIN_SHARING,
  normaliseJoinCode,
  shareOf,
} from "./classMap";

const SQL = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20261028000000_class_misconception_map.sql"),
  "utf8",
);
/** The body of one SQL function, between its `as $$` and closing `$$`. */
function fn(name: string): string {
  const start = SQL.indexOf(`function public.${name}(`);
  const body = SQL.indexOf("$$", start);
  return SQL.slice(body + 2, SQL.indexOf("$$", body + 2)).toLowerCase();
}

const [a, b, c] = MISCONCEPTION_CATALOGUE;

describe("the database decides what a teacher sees", () => {
  it("uses the same thresholds as the screen", () => {
    const map = fn("class_misconception_map");
    expect(map).toContain(`if sharing < ${MIN_SHARING} then`);
    expect(map).toContain(`having count(distinct mc.user_id) >= ${MIN_CELL}`);
  });

  it("returns only catalogue beliefs and counts, never a student's own text", () => {
    const map = fn("class_misconception_map");
    expect(map).toContain("mc.catalogue_id is not null");
    for (const column of ["summary", "concept", "detail", "repair_text", "contrast_text", "user_id,"]) {
      expect(map.split("from public.misconceptions")[0]).not.toContain(column);
    }
    expect(SQL).toMatch(/returns table \(catalogue_id text, students integer\)/);
  });

  it("counts only students who chose to share, and lets only the class's owner ask", () => {
    for (const name of ["class_misconception_map", "class_member_counts"]) {
      expect(fn(name)).toContain("c.owner_id = (select auth.uid())");
    }
    expect(fn("class_misconception_map")).toContain("m.share_mistakes");
  });

  it("gives no one but the student a policy on membership rows, and no direct insert", () => {
    const memberPolicies = [...SQL.matchAll(/create policy "([^"]+)" on public\.class_members[\s\S]*?;/g)].map((m) => m[0]);
    expect(memberPolicies.length).toBe(3);
    for (const p of memberPolicies) expect(p).toContain("user_id = (select auth.uid())");
    expect(SQL).toContain("revoke insert on public.class_members from anon, authenticated;");
  });

  it("starts every membership with sharing off", () => {
    expect(SQL).toContain("share_mistakes boolean not null default false");
  });
});

describe("classMapState", () => {
  it("shows nothing until enough students share, and says how many more", () => {
    expect(classMapState({ joined: 20, sharing: MIN_SHARING - 2 }, [{ catalogue_id: a.id, students: 3 }])).toEqual({
      kind: "too-few",
      sharing: MIN_SHARING - 2,
      needed: 2,
    });
  });

  it("drops beliefs too few students hold, and ids the catalogue no longer has", () => {
    const state = classMapState({ joined: 12, sharing: 8 }, [
      { catalogue_id: a.id, students: 1 },
      { catalogue_id: "gone-from-catalogue", students: 6 },
    ]);
    expect(state).toEqual({ kind: "empty", sharing: 8 });
  });

  it("ranks what the class shares most, with the catalogue's own text", () => {
    const state = classMapState({ joined: 12, sharing: 8 }, [
      { catalogue_id: b.id, students: 2 },
      { catalogue_id: a.id, students: 5 },
      { catalogue_id: c.id, students: 2 },
    ]);
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.entries.map((e) => e.entry.id)[0]).toBe(a.id);
    expect(state.entries[0].students).toBe(5);
    expect(state.entries).toHaveLength(3);
  });
});

describe("wording and codes", () => {
  it("says what the count is out of", () => {
    expect(shareOf(4, 7)).toBe("4 of the 7 students sharing");
  });

  it("reads a code the way students type it", () => {
    expect(normaliseJoinCode(" ab12 cd34 ")).toBe("AB12CD34");
    expect(isJoinCode(normaliseJoinCode("ab12-cd34"))).toBe(true);
    expect(isJoinCode("AB12")).toBe(false);
    expect(isJoinCode("AB12CD3!")).toBe(false);
  });
});
