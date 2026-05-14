import { NextRequest, NextResponse } from "next/server";
import { JWT } from "google-auth-library";

export const runtime = "nodejs";

const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";

function getEnvValue(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} 환경변수가 비어 있습니다.`);
  }
  return value;
}

function getPrivateKey(): string {
  const privateKey = getEnvValue("GOOGLE_CLOUD_PRIVATE_KEY").replace(/\\n/g, "\n");

  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error("GOOGLE_CLOUD_PRIVATE_KEY에 BEGIN PRIVATE KEY가 없습니다.");
  }

  if (!privateKey.includes("-----END PRIVATE KEY-----")) {
    throw new Error("GOOGLE_CLOUD_PRIVATE_KEY에 END PRIVATE KEY가 없습니다.");
  }

  return privateKey;
}

function getMaxFileSizeBytes(): number {
  const maxMb = Number(process.env.OCR_MAX_FILE_SIZE_MB || "5");
  return Math.max(1, maxMb) * 1024 * 1024;
}

function isAllowedImageType(type: string): boolean {
  return ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(type);
}

function getReadableError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "알 수 없는 OCR 오류가 발생했습니다.";
  }
}

async function getGoogleAccessToken(): Promise<string> {
  const clientEmail = getEnvValue("GOOGLE_CLOUD_CLIENT_EMAIL");
  const privateKey = getPrivateKey();

  const jwtClient = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/cloud-vision"],
  });

  const { token } = await jwtClient.getAccessToken();

  if (!token) {
    throw new Error("Google access token을 발급받지 못했습니다.");
  }

  return token;
}

export async function POST(request: NextRequest) {
  try {
    getEnvValue("GOOGLE_CLOUD_PROJECT_ID");
    getEnvValue("GOOGLE_CLOUD_CLIENT_EMAIL");
    getPrivateKey();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "영수증 이미지 파일을 찾지 못했습니다." },
        { status: 400 }
      );
    }

    if (!isAllowedImageType(file.type)) {
      return NextResponse.json(
        { error: "jpg, png, webp 이미지 파일만 사용할 수 있습니다." },
        { status: 400 }
      );
    }

    const maxFileSizeBytes = getMaxFileSizeBytes();
    if (file.size > maxFileSizeBytes) {
      return NextResponse.json(
        {
          error: `이미지 용량은 최대 ${Math.floor(maxFileSizeBytes / 1024 / 1024)}MB까지 가능합니다.`,
        },
        { status: 400 }
      );
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const imageContent = imageBuffer.toString("base64");
    const accessToken = await getGoogleAccessToken();

    const response = await fetch(VISION_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageContent },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            imageContext: {
              languageHints: ["ko", "en"],
            },
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const message = data?.error?.message || `Google Vision OCR 요청 실패: ${response.status}`;
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const result = data?.responses?.[0];
    const apiError = result?.error?.message;
    if (apiError) {
      return NextResponse.json({ error: apiError }, { status: 500 });
    }

    const text = result?.fullTextAnnotation?.text || result?.textAnnotations?.[0]?.description || "";

    const words = (result?.fullTextAnnotation?.pages || []).flatMap((page: any) =>
      (page.blocks || []).flatMap((block: any) =>
        (block.paragraphs || []).flatMap((paragraph: any) =>
          (paragraph.words || []).map((word: any) => {
            const text = (word.symbols || []).map((symbol: any) => symbol.text || "").join("");
            const vertices = word.boundingBox?.vertices || [];
            const xs = vertices.map((vertex: any) => Number(vertex.x || 0));
            const ys = vertices.map((vertex: any) => Number(vertex.y || 0));
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const maxX = Math.max(...xs);
            const maxY = Math.max(...ys);

            return {
              text,
              x: Number.isFinite(minX) ? minX : 0,
              y: Number.isFinite(minY) ? minY : 0,
              width: Number.isFinite(maxX - minX) ? maxX - minX : 0,
              height: Number.isFinite(maxY - minY) ? maxY - minY : 0,
            };
          })
        )
      )
    ).filter((word: any) => word.text && word.text.trim());

    return NextResponse.json({ text, words });
  } catch (error) {
    const message = getReadableError(error);
    console.error("receipt-ocr error", message);

    return NextResponse.json(
      { error: message || "OCR 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
