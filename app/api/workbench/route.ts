import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const dataFile = process.env.WORKBENCH_DATA_FILE ?? "/data/workbench.json";

async function readWorkbenchData() {
  try {
    const content = await readFile(dataFile, "utf8");
    return JSON.parse(content) as unknown;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeWorkbenchData(data: unknown) {
  await mkdir(dirname(dataFile), { recursive: true });
  const tempFile = `${dataFile}.${Date.now()}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tempFile, dataFile);
}

export async function GET() {
  try {
    return Response.json({ data: await readWorkbenchData() });
  } catch {
    return Response.json({ error: "Unable to read workbench data" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as { data?: unknown };
    if (!payload || typeof payload !== "object" || !("data" in payload)) {
      return Response.json({ error: "data is required" }, { status: 400 });
    }

    await writeWorkbenchData(payload.data);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Unable to write workbench data" }, { status: 500 });
  }
}
