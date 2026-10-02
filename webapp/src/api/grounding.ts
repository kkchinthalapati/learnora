/* The student's own passages for a question, loaded for an AI call.
 *
 * Reads materials and notes through the shared query cache, so a session
 * that already has them makes no request. Never throws: grounding is a
 * refinement, and an explanation without it is still an explanation. */

import { queryClient } from "../lib/queryClient";
import {
  buildCorpus,
  groundingDocs,
  retrievePassages,
  type RetrievedPassage,
} from "../lib/grounding";
import { materialsApi } from "./materials";
import { notesApi } from "./notes";
import { materialsKeys } from "../hooks/useMaterials";
import { notesKeys } from "../hooks/useNotes";

const STALE_MS = 5 * 60_000;

/** A passage as saved with a session and shown as its source. */
export interface GroundingSource {
  materialId: string;
  label: string;
  excerpt: string;
}

export async function loadGroundingPassages(query: string, limit = 3): Promise<RetrievedPassage[]> {
  if (!query.trim()) return [];
  try {
    const [materials, notes] = await Promise.all([
      queryClient.fetchQuery({
        queryKey: materialsKeys.list(null),
        queryFn: () => materialsApi.fetch(null),
        staleTime: STALE_MS,
      }),
      queryClient.fetchQuery({
        queryKey: notesKeys.all,
        queryFn: notesApi.fetchAll,
        staleTime: STALE_MS,
      }),
    ]);
    return retrievePassages(buildCorpus(groundingDocs(materials, notes)), query, limit);
  } catch (err) {
    console.warn("[grounding] Could not read your materials:", err);
    return [];
  }
}
