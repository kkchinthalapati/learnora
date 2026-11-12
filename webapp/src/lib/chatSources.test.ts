import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_SOURCES,
  pageContext,
  resolveChatSources,
  type ChatSources,
} from "./chatSources";

const materials = [
  { id: "m-1", title: "Enzymes", folder_id: "f-bio" },
  { id: "m-2", title: "Titration", folder_id: "f-chem" },
];
const folders = [
  { id: "f-bio", name: "Biology" },
  { id: "f-chem", name: "Chemistry" },
  { id: "f-phys", name: "Physics" },
];

function resolve(
  sources: Partial<ChatSources>,
  pathname = "/",
  extra: { materials?: typeof materials | null; webAllowed?: boolean } = {},
) {
  return resolveChatSources(
    { ...DEFAULT_CHAT_SOURCES, ...sources },
    {
      context: pageContext(pathname),
      materials: extra.materials === undefined ? materials : extra.materials,
      folders,
      webAllowed: extra.webAllowed ?? true,
    },
  );
}

describe("pageContext", () => {
  it("reads a lesson or notes page as that lesson", () => {
    expect(pageContext("/lessons/m-1")).toEqual({
      kind: "lesson",
      materialId: "m-1",
    });
    expect(pageContext("/notes/m%2D2")).toEqual({
      kind: "lesson",
      materialId: "m-2",
    });
  });

  it("reads a subject page as that subject, anything else as nothing", () => {
    expect(pageContext("/subjects/f-bio")).toEqual({
      kind: "subject",
      folderId: "f-bio",
    });
    expect(pageContext("/subjects")).toEqual({ kind: "none" });
    expect(pageContext("/")).toEqual({ kind: "none" });
  });
});

describe("resolveChatSources", () => {
  it("keeps the web off by default and uses the lesson you're in", () => {
    const r = resolve({}, "/lessons/m-1");
    expect(r.sourceMode).toBe("notebook");
    expect(r.scope).toEqual({ materialIds: ["m-1"] });
    expect(r.label).toBe("this lesson");
  });

  it("uses the subject on a subject page and all notes elsewhere", () => {
    expect(resolve({}, "/subjects/f-bio")).toMatchObject({
      scope: { folderIds: ["f-bio"] },
      label: "your Biology notes",
    });
    expect(resolve({}, "/subjects")).toMatchObject({
      scope: undefined,
      label: "all your notes",
    });
  });

  it("says general knowledge when there are no notes and no web, which is what the answer is", () => {
    const r = resolve({}, "/subjects", { materials: [] });
    expect(r.sourceMode).toBe("none");
    expect(r.label).toBe("general knowledge");
  });

  it("assumes notes exist while the library is still loading", () => {
    expect(resolve({}, "/", { materials: null }).notesOn).toBe(true);
  });

  it("adds the web only when asked and allowed", () => {
    expect(resolve({ web: true }, "/lessons/m-1")).toMatchObject({
      sourceMode: "hybrid",
      label: "this lesson + the web",
    });
    expect(
      resolve({ web: true }, "/lessons/m-1", { webAllowed: false }),
    ).toMatchObject({
      sourceMode: "notebook",
      webBlocked: true,
    });
    expect(resolve({ web: true, notes: "off" })).toMatchObject({
      sourceMode: "web",
      label: "the web",
    });
  });

  it("limits to picked subjects and names them", () => {
    expect(
      resolve({ notes: "subjects", subjectIds: ["f-bio", "f-chem"] }),
    ).toMatchObject({
      scope: { folderIds: ["f-bio", "f-chem"] },
      label: "Biology and Chemistry",
    });
    expect(
      resolve({ notes: "subjects", subjectIds: ["f-bio", "f-chem", "f-phys"] })
        .label,
    ).toBe("Biology, Chemistry and 1 more");
  });

  it("treats picking no subjects as notes off rather than every note", () => {
    const r = resolve({ notes: "subjects", subjectIds: ["gone"] });
    expect(r.notesOn).toBe(false);
    expect(r.sourceMode).toBe("none");
  });
});
