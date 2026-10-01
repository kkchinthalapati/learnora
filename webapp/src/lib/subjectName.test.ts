import { describe, expect, it } from "vitest";
import { displaySubjectName } from "./subjectName";

describe("displaySubjectName", () => {
  it("capitalises the first letter only", () => {
    expect(displaySubjectName("maths")).toBe("Maths");
    expect(displaySubjectName("organic chemistry")).toBe("Organic chemistry");
    expect(displaySubjectName("Biology")).toBe("Biology");
    expect(displaySubjectName("")).toBe("");
  });
});
