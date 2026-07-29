import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "../../test/render";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { useCreateModal } from "../../context/createModal";

function Harness() {
  const { openCreateModal } = useCreateModal();
  return (
    <button onClick={() => openCreateModal({ type: "material" })}>Open create</button>
  );
}

const folderFixture = [
  { id: "folder-1", user_id: "user-1", name: "Biology", color: "#4A90E2" },
];

describe("MaterialPanel", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/folders`, () => HttpResponse.json(folderFixture)),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function outputCheckbox(name: string): HTMLInputElement {
  const checkbox = screen
    .getByText(name)
    .closest("label")
    ?.querySelector("input");
  if (!checkbox) throw new Error(`No checkbox found for output "${name}"`);
  return checkbox as HTMLInputElement;
}

async function openDialog() {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open create" }));
    // Let the folders query resolve so the default-folder effect settles.
    await waitFor(() => expect(screen.getByLabelText("Folder")).toHaveValue("folder-1"));
    return user;
  }

  it("defaults to the File source with Notes forced on", async () => {
    await openDialog();
    expect(screen.getByRole("radio", { name: "File" })).toBeChecked();
    expect(outputCheckbox("Notes")).toBeChecked();
    expect(outputCheckbox("Notes")).toBeDisabled();
  });

  it("hides the Saved source option when there are no saved materials", async () => {
    server.use(http.get(`${SUPABASE_URL}/rest/v1/materials`, () => HttpResponse.json([])));
    await openDialog();
    expect(screen.queryByRole("radio", { name: "Saved" })).not.toBeInTheDocument();
  });

  it("shows the Saved source option once a material exists", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/materials`, () =>
        HttpResponse.json([{ id: "m1", title: "Chapter 4 notes" }]),
      ),
    );
    const user = await openDialog();
    await user.click(await screen.findByRole("radio", { name: "Saved" }));
    expect(screen.getByRole("option", { name: "Chapter 4 notes" })).toBeInTheDocument();
  });

  it("requires a file for the File source", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a file to create from");
  });

  it("requires at least a paragraph of text for the Text source", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("radio", { name: "Text" }));
    await user.type(
      screen.getByLabelText("Paste your notes or text"),
      "Too short",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("a bit short to study from");
  });

  it("rejects a non-http(s) link", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("radio", { name: "Link" }));
    await user.type(screen.getByRole("textbox", { name: "Link" }), "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Links have to start with http:// or https://",
    );
  });

  it("rejects text that isn't a URL at all", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("radio", { name: "Link" }));
    await user.type(screen.getByRole("textbox", { name: "Link" }), "not a link");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("doesn't look like a link");
  });

  it("requires a topic for the Topic source and hides the folder picker", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("radio", { name: "Topic" }));
    expect(screen.queryByLabelText("Folder")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a topic to create from");
  });

  it("requires at least one output for the Topic source (notes isn't implicit)", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("radio", { name: "Topic" }));
    await user.type(screen.getByRole("textbox", { name: "Topic" }), "Ionic bonding");
    // Flashcards default on, Quiz defaults off — unchecking the former
    // without touching the latter leaves both false.
    await user.click(outputCheckbox("Flashcards"));
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pick at least one thing to create",
    );
  });

  it("requires a folder for a new-material source", async () => {
    server.use(http.get(`${SUPABASE_URL}/rest/v1/folders`, () => HttpResponse.json([])));
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open create" }));
    await user.click(screen.getByRole("radio", { name: "Text" }));
    await user.type(
      screen.getByLabelText("Paste your notes or text"),
      "A full paragraph of text that is definitely long enough to pass validation.",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a folder to save this into",
    );
  });

  it("only shows quiz tuning options once Quiz is checked", async () => {
    const user = await openDialog();
    await user.click(screen.getByText("Options"));
    expect(screen.queryByText("Quiz difficulty")).not.toBeInTheDocument();
    await user.click(outputCheckbox("Quiz"));
    expect(screen.getByText("Quiz difficulty")).toBeInTheDocument();
  });

  it("reports the AI stub instead of closing on a fully valid submission", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("radio", { name: "Text" }));
    await user.type(
      screen.getByLabelText("Paste your notes or text"),
      "A full paragraph of text that is definitely long enough to pass validation.",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI-powered generation isn't connected yet",
    );
    // Unlike a real submit (which closes the dialog immediately), the stub
    // leaves the form open and untouched so the message is readable.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("creates a folder inline via the dialog prompt and selects it", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/folders`, async ({ request }) => {
        const [body] = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json({ id: "folder-2", ...body }, { status: 201 });
      }),
    );
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "+ New" }));

    const promptDialog = await screen.findByRole("alertdialog", { name: "New folder" });
    await user.type(within(promptDialog).getByRole("textbox"), "Chemistry");
    await user.click(within(promptDialog).getByRole("button", { name: "Create folder" }));

    await waitFor(() => expect(screen.getByLabelText("Folder")).toHaveValue("folder-2"));
  });
});
