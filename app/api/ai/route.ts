const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const openAiBaseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AiAction = {
  type?: string;
  name?: string;
  goal?: string;
  title?: string;
  date?: string;
  start?: string;
  end?: string;
  project?: string;
  dueDate?: string;
  priority?: string;
  status?: string;
  note?: string;
};

function extractText(payload: unknown) {
  const choices = payload && typeof payload === "object" && "choices" in payload && Array.isArray(payload.choices) ? payload.choices : [];
  const chatText = choices
    .map((choice) => {
      if (!choice || typeof choice !== "object" || !("message" in choice)) return "";
      const message = choice.message;
      if (!message || typeof message !== "object" || !("content" in message)) return "";
      return typeof message.content === "string" ? message.content : "";
    })
    .filter(Boolean)
    .join("\n");
  if (chatText) return chatText;

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

function parseCommandResponse(text: string) {
  const jsonText = text.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  try {
    const parsed = JSON.parse(jsonText) as { reply?: unknown; actions?: unknown };
    const actions = Array.isArray(parsed.actions) ? (parsed.actions as AiAction[]) : [];
    return {
      text: typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "已理解。",
      actions,
    };
  } catch {
    return { text, actions: [] as AiAction[] };
  }
}

function getShanghaiNow() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    weekday: values.weekday,
    label: `${values.year}-${values.month}-${values.day} ${values.weekday} ${values.hour}:${values.minute} Asia/Shanghai`,
  };
}

export async function POST(request: Request) {
  if (!openAiApiKey) {
    return Response.json({ error: "未配置 OPENAI_API_KEY。请在 Docker 环境变量里设置后重启工作台。" }, { status: 503 });
  }

  try {
    const payload = (await request.json()) as {
      mode?: "suggestions" | "chat" | "command";
      message?: string;
      messages?: ChatMessage[];
      data?: unknown;
    };
    const mode = payload.mode ?? "chat";
    const workbenchData = JSON.stringify(payload.data ?? {}, null, 2).slice(0, 24000);
    const recentMessages = (payload.messages ?? []).slice(-8);
    const now = getShanghaiNow();

    const instructions =
      "你是一个中文个人工作台助理。你只能基于用户提供的工作台 JSON、当前对话和明确可推断的信息回答。" +
      `当前上海时间是 ${now.label}。` +
      "判断今天的会议、日程和 Todo 时必须结合当前时间；已经早于当前时间的今日会议不能说成接下来要开，只能说已过去、已错过或用于回顾。" +
      "不要编造不存在的项目、会议或 Todo。回答要短、具体、可执行。";
    const commandInstructions =
      instructions +
      "当用户要求你创建或更新工作台内容时，只能输出 JSON，格式为：" +
      "{\"reply\":\"给用户看的简短中文回复\",\"actions\":[...]}。" +
      "可用 actions 只有：" +
      "{\"type\":\"create_project\",\"name\":\"项目名\",\"goal\":\"目标\"}；" +
      "{\"type\":\"create_meeting\",\"title\":\"主题\",\"date\":\"YYYY-MM-DD\",\"start\":\"HH:mm\",\"end\":\"HH:mm\",\"project\":\"项目名或 Inbox / 未归类\",\"note\":\"备注\"}；" +
      "{\"type\":\"create_task\",\"title\":\"Todo 标题\",\"project\":\"项目名或 Inbox / 未归类\",\"dueDate\":\"YYYY-MM-DD\",\"priority\":\"high|medium|low\",\"note\":\"备注\"}；" +
      "{\"type\":\"update_task_status\",\"title\":\"Todo 标题\",\"status\":\"todo|doing|waiting|done\"}。" +
      "如果用户只是查询或建议，actions 返回空数组。缺少日期时用今天，今天是 " +
      now.date +
      "。不要输出 markdown，不要输出 JSON 以外的文字。";

    const messages =
      mode === "suggestions"
        ? [
            { role: "system", content: instructions },
            {
              role: "user",
              content:
                `当前上海时间：${now.label}\n请基于下面的个人工作台 JSON，给出 3 条今天建议。每条单独一行，不要编号，不要客套；不要把已经过去的今日会议说成未来安排。\n\n` +
                workbenchData,
            },
          ]
        : mode === "command"
          ? [
              { role: "system", content: commandInstructions },
              ...recentMessages.map((message) => ({
                role: message.role,
                content: message.content,
              })),
              {
                role: "user",
                content: `当前上海时间：${now.label}\n当前个人工作台 JSON：\n${workbenchData}\n\n用户最新指令或问题：${payload.message ?? ""}`,
              },
            ]
        : [
            { role: "system", content: instructions },
            ...recentMessages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            {
              role: "user",
              content: `当前上海时间：${now.label}\n当前个人工作台 JSON：\n${workbenchData}\n\n用户最新问题：${payload.message ?? ""}`,
            },
          ];

    const response = await fetch(`${openAiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${openAiApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: openAiModel,
        messages,
        temperature: 1,
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

    if (mode === "command") {
      return Response.json(parseCommandResponse(text || "{\"reply\":\"我没有拿到可用回复。\",\"actions\":[]}"));
    }

    return Response.json({ text: text || "我没有拿到可用回复。" });
  } catch {
    return Response.json({ error: "LLM 请求处理失败" }, { status: 500 });
  }
}
