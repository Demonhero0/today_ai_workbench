import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function requestWorkbench(method, body) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${method}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/api/workbench", {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the workbench shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>AI 个人工作台<\/title>/i);
  assert.match(html, /AI 工作台/);
  assert.match(html, /快速记录/);
  assert.match(html, /AI 今日建议/);
  assert.match(html, /任务队列/);
  assert.match(html, /回收站/);
  assert.match(html, /会议安排/);
  assert.match(html, /本周时间轴/);
});

test("does not keep starter preview code", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /SkeletonPreview|codex-preview|react-loading-skeleton/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview|_sites-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("reads and writes workbench data through the mounted data API", async () => {
  const data = {
    tasks: [],
    projects: [{ id: "p1", name: "Mounted data", log: [] }],
    events: [],
  };

  const writeResponse = await requestWorkbench("PUT", { data });
  assert.equal(writeResponse.status, 200);
  assert.deepEqual(await writeResponse.json(), { ok: true });

  const readResponse = await requestWorkbench("GET");
  assert.equal(readResponse.status, 200);
  assert.deepEqual(await readResponse.json(), { data });
});
