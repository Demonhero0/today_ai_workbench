const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function extractText(payload: unknown) {
  if (payload && typeof payload === "object" && "output_text" in payload && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const output = payload && typeof payload === "object" && "output" in payload && Array.isArray(payload.output) ? payload.output : [];
  return output
    .flatMap((item) => (item && typeof item === "object" && "content" in item && Array.isArray(item.content) ? item.content : []))
    .map((content) => {
      if (content && typeof content === "object" && "text" in content && typeof content.text === "string") return content.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function parseSuggestions(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-* numbered:.\d、)]+/i, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

export async function POST(request: Request) {
  if (!openAiApiKey) {
    return Response.json({ error: "未配置 OPENAI_API_KEY。请在 Docker 环境变量里设置后重启工作台。" }, { status: 503 });
  }

  try {
    const payload = (await request.json()) as {
      mode?: "suggestions" | "chat";
      message?: string;
      messages?: ChatMessage[];
      data?: unknown;
    };
    const mode = payload.mode ?? "chat";
    const workbenchData = JSON.stringify(payload.data ?? {}, null, 2).slice(0, 24000);
    const recentMessages = (payload.messages ?? []).slice(-8);

    const instructions =
      "你是一个中文个人工作台助理。你只能基于用户提供的工作台 JSON、当前对话和明确可推断的信息回答。" +
      "不要编造不存在的项目、会议或 Todo。回答要短、具体、可执行。";

    const input =
      mode === "suggestions"
        ? [
            {
              role: "user",
              content:
                "请基于下面的个人工作台 JSON，给出 3 条今日建议。每条单独一行，不要编号，不要客套。\n\n" +
                workbenchData,
            },
          ]
        : [
            ...recentMessages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            {
              role: "user",
              content: `当前个人工作台 JSON：\n${workbenchData}\n\n用户最新问题：${payload.message ?? ""}`,
            },
          ];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${openAiApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: openAiModel,
        instructions,
        input,
        temperature: 0.3,
      }),
    });

    const responsePayload = await response.json();
    if (!response.ok) {
      const message =
        responsePayload && typeof responsePayload === "object" && "error" in responsePayload
          ? JSON.stringify(responsePayload.error)
          : "OpenAI API 请求失败";
      return Response.json({ error: message }, { status: response.status });
    }

    const text = extractText(responsePayload).trim();
    if (mode === "suggestions") {
      return Response.json({ text, suggestions: parseSuggestions(text) });
    }

    return Response.json({ text: text || "我没有拿到可用回复。" });
  } catch {
    return Response.json({ error: "LLM 请求处理失败" }, { status: 500 });
  }
}
