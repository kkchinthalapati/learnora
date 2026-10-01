import { describe, expect, it } from "vitest";
import { friendlyErrorMessage } from "./friendlyError";

describe("friendlyErrorMessage", () => {
  it.each([
    ["JWT expired", "Your session has expired. Please sign in again."],
    ["Invalid Refresh Token: Refresh Token Not Found", "Your session has expired. Please sign in again."],
    ['relation "exams" does not exist', "Something went wrong on our side. Please try again."],
    ['duplicate key value violates unique constraint "folders_name_key"', "That already exists."],
    ["TimeoutError: signal timed out", "Learnora is taking too long to respond. Please try again."],
    ["TypeError: Failed to fetch", "Couldn't reach Learnora. Check your connection and try again."],
    ["{}", "Something went wrong on our side. Please try again."],
    ["", "Something went wrong on our side. Please try again."],
  ])("rewrites %j", (raw, friendly) => {
    expect(friendlyErrorMessage(raw)).toBe(friendly);
  });

  it.each([
    "Failed to rewrite notes.",
    "Study session not found",
    "A folder with that name already exists.",
    "That password is not correct.",
  ])("leaves the app's own wording alone: %j", (message) => {
    expect(friendlyErrorMessage(message)).toBe(message);
  });
});
