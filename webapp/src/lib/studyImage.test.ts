import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fitWithin,
  isImageFile,
  MAX_RAW_IMAGE_BYTES,
  prepareStudyImage,
  StudyImageError,
  validateStudyImage,
} from "./studyImage";

const TEN_MB = 10 * 1024 * 1024;

function photo(name: string, type: string, bytes = 1024): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

/** jsdom has neither `createImageBitmap` nor a 2D canvas, so both are stood
 *  in for: a bitmap of the given size, and a canvas that records what it was
 *  asked to draw and hands back a JPEG blob. */
function fakeDecoder(width: number, height: number, outBytes = 400_000) {
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width, height, close })),
  );
  const drawn: { width: number; height: number }[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      const { width, height } = this;
      return {
        fillStyle: "",
        fillRect: () => {},
        drawImage: () => drawn.push({ width, height }),
      } as unknown as CanvasRenderingContext2D;
    } as unknown as HTMLCanvasElement["getContext"],
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback: BlobCallback, type?: string) => {
      const blob = new Blob(["jpeg"], { type });
      Object.defineProperty(blob, "size", { value: outBytes });
      callback(blob);
    },
  );
  return { drawn, close };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fitWithin", () => {
  it("scales the long edge down to the ceiling and keeps the aspect ratio", () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3024, 4032, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it("never scales a small image up", () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });
});

describe("validateStudyImage", () => {
  it("accepts JPEG, PNG and WebP, including a JPEG whose type the browser left blank", () => {
    expect(() => validateStudyImage(photo("a.jpg", "image/jpeg"))).not.toThrow();
    expect(() => validateStudyImage(photo("a.png", "image/png"))).not.toThrow();
    expect(() => validateStudyImage(photo("a.webp", "image/webp"))).not.toThrow();
    expect(() => validateStudyImage(photo("board.JPG", ""))).not.toThrow();
  });

  it("refuses formats it could not scale, with a reason a student can act on", () => {
    expect(() => validateStudyImage(photo("a.heic", "image/heic"))).toThrow(
      /Use a JPEG, PNG or WebP/,
    );
    expect(() => validateStudyImage(photo("a.gif", "image/gif"))).toThrow(StudyImageError);
  });

  it("refuses an empty photo and one over the raw ceiling", () => {
    expect(() => validateStudyImage(photo("a.jpg", "image/jpeg", 0))).toThrow(/empty/);
    expect(() =>
      validateStudyImage(photo("a.jpg", "image/jpeg", MAX_RAW_IMAGE_BYTES + 1)),
    ).toThrow(/limit is 25MB/);
  });
});

describe("isImageFile", () => {
  it("recognises images by type or extension, and leaves documents alone", () => {
    expect(isImageFile(photo("a.jpg", "image/jpeg"))).toBe(true);
    expect(isImageFile(photo("scan.png", ""))).toBe(true);
    expect(isImageFile(photo("iphone.heic", ""))).toBe(true);
    expect(isImageFile(photo("notes.pdf", "application/pdf"))).toBe(false);
  });
});

describe("prepareStudyImage", () => {
  it("shrinks a large phone photo to a JPEG within the ceiling", async () => {
    const { drawn, close } = fakeDecoder(4032, 3024);
    const result = await prepareStudyImage(
      photo("whiteboard.png", "image/png", 6_000_000),
      TEN_MB,
    );
    expect(result.resized).toBe(true);
    expect(result.originalBytes).toBe(6_000_000);
    expect(result.file.name).toBe("whiteboard.jpg");
    expect(result.file.type).toBe("image/jpeg");
    expect(drawn).toEqual([{ width: 2048, height: 1536 }]);
    expect(close).toHaveBeenCalled();
  });

  it("sends a photo that is already small unchanged", async () => {
    const { drawn } = fakeDecoder(800, 600);
    const original = photo("worksheet.jpg", "image/jpeg", 200_000);
    const result = await prepareStudyImage(original, TEN_MB);
    expect(result.resized).toBe(false);
    expect(result.file).toBe(original);
    expect(drawn).toEqual([]);
  });

  it("explains a photo that cannot be decoded", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("decode failed");
      }),
    );
    await expect(
      prepareStudyImage(photo("broken.jpg", "image/jpeg"), TEN_MB),
    ).rejects.toThrow(/couldn't be opened/);
  });

  it("refuses when shrinking still leaves it over the upload limit", async () => {
    fakeDecoder(4032, 3024, TEN_MB + 1);
    await expect(
      prepareStudyImage(photo("huge.jpg", "image/jpeg", 20_000_000), TEN_MB),
    ).rejects.toThrow(/still too large/);
  });

  it("falls back to the original where the browser cannot decode off-screen", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const typeless = photo("page.jpeg", "", 500_000);
    const result = await prepareStudyImage(typeless, TEN_MB);
    expect(result.resized).toBe(false);
    // The type is filled in from the extension so the attachment is never
    // sent with an empty mimeType.
    expect(result.file.type).toBe("image/jpeg");

    await expect(
      prepareStudyImage(photo("big.jpg", "image/jpeg", TEN_MB + 1), TEN_MB),
    ).rejects.toThrow(/can't shrink it/);
  });
});
