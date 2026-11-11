/* The student's own passages for a question, loaded for an AI call, and the
 * other materials that cover a note's concepts.
 *
 * Reads materials and notes through the shared query cache, so a session
 * that already has them makes no request. Never throws: grounding is a
 * refinement, and an explanation without it is still an explanation. */

import { queryClient } from "../lib/queryClient";
import {
  buildCorpus,
  groundingDocs,
  relatedMaterials,
  retrievePassages,
  type RelatedMaterial,
  type RetrievedPassage,
} from "../lib/grounding";
import { materialsApi } from "./materials";
import { notesApi } from "./notes";
import { materialsKeys } from "../hooks/useMaterials";
import { notesKeys } from "../hooks/useNotes";
import type { GroundingScope } from "../lib/chatSources";

const STALE_MS = 5 * 60_000;

/** A passage as saved with a session and shown as its source. */
export interface GroundingSource {
  materialId: string;
  label: string;
  excerpt: string;
}

/* No retries: a failed read is answered without grounding, now, rather than
   after the client's backoff — the chat waits on this before every reply. */
function loadLibrary() {
  return Promise.all([
    queryClient.fetchQuery({
      queryKey: materialsKeys.list(null),
      queryFn: () => materialsApi.fetch(null),
      staleTime: STALE_MS,
      retry: false,
    }),
    queryClient.fetchQuery({
      queryKey: notesKeys.all,
      queryFn: notesApi.fetchAll,
      staleTime: STALE_MS,
      retry: false,
    }),
  ]);
}

/** `scope` narrows the search to some lessons or subjects (the Ask panel's
 *  sources, lib/chatSources.ts); without it every note is searched. */
export async function loadGroundingPassages(
  query: string,
  limit = 3,
  scope?: GroundingScope,
): Promise<RetrievedPassage[]> {
  if (!query.trim()) return [];
  try {
    const [allMaterials, allNotes] = await loadLibrary();
    const materials = scope
      ? allMaterials.filter(
          (m) =>
            (scope.materialIds?.includes(m.id) ?? false) ||
            (m.folder_id !== null && (scope.folderIds?.includes(m.folder_id) ?? false)),
        )
      : allMaterials;
    /* Notes carry their own material id and are read even when the material
       row is missing, so the scope has to apply to them directly. */
    const allowed = scope ? new Set(materials.map((m) => m.id)) : null;
    const notes = allowed ? allNotes.filter((n) => n.material_id !== null && allowed.has(n.material_id)) : allNotes;
    return retrievePassages(buildCorpus(groundingDocs(materials, notes)), query, limit);
  } catch (err) {
    console.warn("[grounding] Could not read your materials:", err);
    return [];
  }
}

/** The other materials that cover this material's concepts, read from its
 *  saved note. Empty when it has no note yet, or nothing else matches. */
export async function loadRelatedMaterials(materialId: string): Promise<RelatedMaterial[]> {
  try {
    const [materials, notes] = await loadLibrary();
    const own = notes.find((n) => n.material_id === materialId)?.markdown_content;
    if (!own?.trim()) return [];
    return relatedMaterials(buildCorpus(groundingDocs(materials, notes)), materialId, own);
  } catch (err) {
    console.warn("[grounding] Could not read your materials:", err);
    return [];
  }
}
