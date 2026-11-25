import { beforeEach, describe, expect, it, vi } from "vitest";

/* The reaction call must stay insert-only: the table grants clients no UPDATE
 * (see boardroom.hardening.sql.test.ts), so an upsert that falls back to
 * DO UPDATE would be refused by the database. */

const calls = vi.hoisted(() => ({
  upsert: vi.fn(),
  del: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  mockData: null as unknown,
}));

vi.mock("../lib/supabase", () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {
      select: vi.fn((...args: unknown[]) => {
        calls.select(...args);
        return chain;
      }),
      eq: vi.fn((...args: unknown[]) => {
        calls.eq(...args);
        return chain;
      }),
      order: vi.fn((...args: unknown[]) => {
        calls.order(...args);
        return chain;
      }),
      limit: vi.fn((...args: unknown[]) => {
        calls.limit(...args);
        return chain;
      }),
      maybeSingle: vi.fn(() => Promise.resolve({ data: calls.mockData, error: null })),
      upsert: (...args: unknown[]) => {
        calls.upsert(...args);
        return Promise.resolve({ data: null, error: null });
      },
      delete: () => {
        calls.del();
        return chain;
      },
      then: (res: (v: unknown) => void) => res({ data: calls.mockData, error: null }),
    };
    return chain;
  };

  return {
    supabase: {
      from: (table: string) => {
        calls.from(table);
        return makeChain();
      },
      rpc: (fn: string, params: unknown) => {
        calls.rpc(fn, params);
        return Promise.resolve({ data: calls.mockData ?? "mock-doc-id", error: null });
      },
    },
  };
});
vi.mock("./session", () => ({ requireUserId: async () => "u1" }));

import { boardroomApi } from "./boardroom";

beforeEach(() => {
  calls.upsert.mockClear();
  calls.del.mockClear();
  calls.from.mockClear();
  calls.select.mockClear();
  calls.eq.mockClear();
  calls.order.mockClear();
  calls.limit.mockClear();
  calls.maybeSingle.mockClear();
  calls.rpc.mockClear();
  calls.mockData = null;
});

describe("boardroomApi.toggleReaction", () => {
  it("adds a reaction as an insert that ignores duplicates", async () => {
    await boardroomApi.toggleReaction("w", "m1", "agree", true);
    expect(calls.upsert).toHaveBeenCalledTimes(1);
    const [row, options] = calls.upsert.mock.calls[0];
    expect(row).toEqual({ message_id: "m1", workspace_id: "w", user_id: "u1", emoji: "agree" });
    expect(options).toMatchObject({ ignoreDuplicates: true });
  });

  it("removes a reaction with a delete", async () => {
    await boardroomApi.toggleReaction("w", "m1", "agree", false);
    expect(calls.del).toHaveBeenCalledTimes(1);
    expect(calls.upsert).not.toHaveBeenCalled();
  });
});

describe("boardroomApi.documents and documentContent (M6)", () => {
  it("queries boardroom_documents for metadata only without content column", async () => {
    const mockDocs = [
      {
        id: "d1",
        workspace_id: "w1",
        slug: "overview.md",
        title: "Overview",
        category: "overview",
        owner_id: "u1",
        archived: false,
        current_version: 2,
        created_at: "2026-11-08T10:00:00Z",
        updated_at: "2026-11-08T11:00:00Z",
      },
    ];
    calls.mockData = mockDocs;

    const res = await boardroomApi.documents("w1");
    expect(calls.from).toHaveBeenCalledWith("boardroom_documents");
    expect(calls.select).toHaveBeenCalledWith(
      "id, workspace_id, slug, title, category, owner_id, archived, current_version, created_at, updated_at",
    );
    expect(calls.eq).toHaveBeenCalledWith("workspace_id", "w1");
    expect(calls.order).toHaveBeenCalledWith("slug");
    expect(res).toEqual(mockDocs);
    expect("content" in res[0]).toBe(false);
  });

  it("queries latest document content on-demand from boardroom_document_versions", async () => {
    calls.mockData = { content: "# Architecture Overview\nSystem components." };

    const content = await boardroomApi.documentContent("d1");
    expect(calls.from).toHaveBeenCalledWith("boardroom_document_versions");
    expect(calls.select).toHaveBeenCalledWith("content");
    expect(calls.eq).toHaveBeenCalledWith("document_id", "d1");
    expect(calls.order).toHaveBeenCalledWith("version", { ascending: false });
    expect(calls.limit).toHaveBeenCalledWith(1);
    expect(content).toBe("# Architecture Overview\nSystem components.");
  });

  it("queries specific document version content on-demand", async () => {
    calls.mockData = { content: "Version 1 draft content" };

    const content = await boardroomApi.documentContent("d1", 1);
    expect(calls.from).toHaveBeenCalledWith("boardroom_document_versions");
    expect(calls.select).toHaveBeenCalledWith("content");
    expect(calls.eq).toHaveBeenCalledWith("document_id", "d1");
    expect(calls.eq).toHaveBeenCalledWith("version", 1);
    expect(content).toBe("Version 1 draft content");
  });

  it("returns empty string when document version is not found", async () => {
    calls.mockData = null;

    const content = await boardroomApi.documentContent("nonexistent");
    expect(content).toBe("");
  });
});

describe("boardroomApi.saveDocument (M7)", () => {
  it("passes expectedVersion as p_expected_version to boardroom_save_document RPC", async () => {
    calls.mockData = "doc-123";
    const res = await boardroomApi.saveDocument({
      ws: "ws-1",
      slug: "doc.md",
      title: "Doc Title",
      category: "general",
      content: "Hello world",
      archived: false,
      expectedVersion: 3,
    });

    expect(calls.rpc).toHaveBeenCalledWith("boardroom_save_document", {
      p_ws: "ws-1",
      p_slug: "doc.md",
      p_title: "Doc Title",
      p_category: "general",
      p_content: "Hello world",
      p_archived: false,
      p_expected_version: 3,
    });
    expect(res).toBe("doc-123");
  });

  it("passes null as p_expected_version when expectedVersion is omitted", async () => {
    calls.mockData = "doc-456";
    const res = await boardroomApi.saveDocument({
      ws: "ws-1",
      slug: "doc.md",
      title: "Doc Title",
      category: "general",
      content: "Hello world",
    });

    expect(calls.rpc).toHaveBeenCalledWith("boardroom_save_document", {
      p_ws: "ws-1",
      p_slug: "doc.md",
      p_title: "Doc Title",
      p_category: "general",
      p_content: "Hello world",
      p_archived: false,
      p_expected_version: null,
    });
    expect(res).toBe("doc-456");
  });

  it("passes 0 as p_expected_version when expectedVersion is 0 for document creation", async () => {
    calls.mockData = "doc-789";
    const res = await boardroomApi.saveDocument({
      ws: "ws-1",
      slug: "new.md",
      title: "New Doc",
      category: "general",
      content: "Initial draft",
      expectedVersion: 0,
    });

    expect(calls.rpc).toHaveBeenCalledWith("boardroom_save_document", {
      p_ws: "ws-1",
      p_slug: "new.md",
      p_title: "New Doc",
      p_category: "general",
      p_content: "Initial draft",
      p_archived: false,
      p_expected_version: 0,
    });
    expect(res).toBe("doc-789");
  });
});

