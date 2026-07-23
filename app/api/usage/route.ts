type ProviderStatus = "ready" | "missing-key" | "error";

type UsageWindow = {
  key: string;
  label: string;
  value: string;
  remaining?: string | null;
  limit?: string | null;
  utilization?: number | null;
  resetsAt?: string | null;
};

const kimiUsageUrl = process.env.KIMI_CODING_USAGE_URL ?? "https://api.kimi.com/coding/v1/usages";
const codexUsageUrl = process.env.CODEX_USAGE_URL ?? "https://chatgpt.com/backend-api/wham/usage";
const codexResetCreditsUrl = process.env.CODEX_RESET_CREDITS_URL ?? "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
const openAiBaseUrl = (process.env.OPENAI_BASE_URL ?? "").toLowerCase();
const kimiCodingApiKey =
  process.env.KIMI_CODING_API_KEY ||
  process.env.KIMI_API_KEY ||
  (openAiBaseUrl.includes("kimi") || openAiBaseUrl.includes("moonshot") ? process.env.OPENAI_API_KEY : "");
const codexAccessToken = process.env.CODEX_ACCESS_TOKEN;

const kimiWindowSeconds: Record<number, { key: string; label: string }> = {
  18000: { key: "short_term", label: "5 小时窗口" },
};

const timeUnitSeconds: Record<string, number> = {
  TIME_UNIT_SECOND: 1,
  TIME_UNIT_MINUTE: 60,
  TIME_UNIT_HOUR: 3600,
  TIME_UNIT_DAY: 86400,
};

const codexWindowSeconds: Record<number, { key: string; label: string }> = {
  18000: { key: "short_term", label: "短窗口" },
  604800: { key: "long_term", label: "周窗口" },
};

function providerResult(status: ProviderStatus, label: string, message: string, windows: UsageWindow[] = []) {
  return { status, label, message, windows };
}

function extractError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = payload.error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
    return JSON.stringify(error);
  }
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") return payload.message;
  return fallback;
}

function percentValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function compactNumber(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function usageFromDetail(key: string, label: string, detail: unknown): UsageWindow | null {
  if (!detail || typeof detail !== "object") return null;
  const record = detail as Record<string, unknown>;
  const used = percentValue(record.used);
  const limit = percentValue(record.limit);
  if (used === null || limit === null) return null;
  const utilization = limit > 0 ? (used / limit) * 100 : null;
  return {
    key,
    label,
    utilization,
    value: limit > 0 && utilization !== null ? `${utilization.toFixed(1)}%` : `${used}/${limit}`,
    remaining: compactNumber(Math.max(0, limit - used)),
    limit: compactNumber(limit),
    resetsAt: typeof record.resetTime === "string" ? record.resetTime : null,
  };
}

function resetAtIso(value: unknown) {
  if (value === null || value === undefined) return null;
  const seconds = percentValue(value);
  if (seconds === null) return null;
  try {
    return new Date(seconds * 1000).toISOString();
  } catch {
    return null;
  }
}

function codexWindow(key: string, label: string, windowData: Record<string, unknown>): UsageWindow {
  const utilization = percentValue(windowData.used_percent);
  return {
    key,
    label,
    utilization,
    value: utilization === null ? "已获取" : `${utilization.toFixed(1)}%`,
    resetsAt: resetAtIso(windowData.reset_at),
  };
}

function parseKimiWindows(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const data = payload as Record<string, unknown>;
  const windows: UsageWindow[] = [];
  const weekly = usageFromDetail("long_term", "7 天周配额", data.usage);
  if (weekly) windows.push(weekly);

  if (Array.isArray(data.limits)) {
    for (const entry of data.limits) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const window = record.window && typeof record.window === "object" ? (record.window as Record<string, unknown>) : {};
      const multiplier = typeof window.timeUnit === "string" ? timeUnitSeconds[window.timeUnit] : undefined;
      const duration = typeof window.duration === "number" ? window.duration : undefined;
      const seconds = multiplier !== undefined && duration !== undefined ? multiplier * duration : undefined;
      const mapped = seconds === undefined ? undefined : kimiWindowSeconds[seconds];
      if (!mapped) continue;
      const parsed = usageFromDetail(mapped.key, mapped.label, record.detail);
      if (parsed) windows.push(parsed);
    }
  }

  return windows;
}

function parseCodexWindows(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const data = payload as Record<string, unknown>;
  const rateLimit = data.rate_limit && typeof data.rate_limit === "object" ? (data.rate_limit as Record<string, unknown>) : {};
  const windows: UsageWindow[] = [];

  for (const rawKey of ["primary_window", "secondary_window"]) {
    const windowData = rateLimit[rawKey];
    if (!windowData || typeof windowData !== "object") continue;
    const record = windowData as Record<string, unknown>;
    const seconds = percentValue(record.limit_window_seconds);
    const mapped = seconds === null ? null : codexWindowSeconds[seconds];
    if (!mapped || windows.some((window) => window.key === mapped.key)) continue;
    windows.push(codexWindow(mapped.key, mapped.label, record));
  }

  const spark = parseCodexSpark(data);
  if (spark) windows.push(spark);
  const credits = parseCodexCredits(data);
  if (credits) windows.push(credits);
  const resetCredits = parseCodexResetCredits(data);
  if (resetCredits) windows.push(resetCredits);

  return windows;
}

function parseCodexSpark(data: Record<string, unknown>): UsageWindow | null {
  const limits = data.additional_rate_limits;
  if (!Array.isArray(limits)) return null;
  const entry = limits.find(
    (item) =>
      item &&
      typeof item === "object" &&
      ((item as Record<string, unknown>).metered_feature === "codex_bengalfox" ||
        String((item as Record<string, unknown>).limit_name ?? "").toLowerCase().includes("spark")),
  );
  if (!entry || typeof entry !== "object") return null;
  const rateLimit = (entry as Record<string, unknown>).rate_limit;
  const primaryWindow = rateLimit && typeof rateLimit === "object" ? (rateLimit as Record<string, unknown>).primary_window : null;
  if (!primaryWindow || typeof primaryWindow !== "object") return null;
  return codexWindow("model_spark", "Spark 模型额度", primaryWindow as Record<string, unknown>);
}

function parseCodexCredits(data: Record<string, unknown>): UsageWindow | null {
  const credits = data.credits;
  if (!credits || typeof credits !== "object") return null;
  const record = credits as Record<string, unknown>;
  if (!record.has_credits || record.unlimited) return null;
  const balance = percentValue(record.balance);
  if (balance === null) return null;
  return { key: "credits", label: "Credits", utilization: null, value: String(balance), resetsAt: null };
}

function parseCodexResetCredits(data: Record<string, unknown>): UsageWindow | null {
  const resetCredits = data.rate_limit_reset_credits;
  if (!resetCredits || typeof resetCredits !== "object") return null;
  const count = percentValue((resetCredits as Record<string, unknown>).available_count);
  if (count === null) return null;
  return { key: "reset_credits", label: "重置机会", utilization: null, value: `${count} 次`, resetsAt: null };
}

async function attachResetCreditExpiry(windows: UsageWindow[]) {
  const resetCredits = windows.find((window) => window.key === "reset_credits");
  if (!resetCredits || !codexAccessToken) return;

  const response = await fetch(codexResetCreditsUrl, {
    headers: {
      authorization: `Bearer ${codexAccessToken}`,
      "openai-beta": "codex-1",
      originator: "Codex Desktop",
    },
    cache: "no-store",
  });
  if (!response.ok) return;
  const payload = await response.json().catch(() => null);
  const credits = payload && typeof payload === "object" && "credits" in payload && Array.isArray(payload.credits) ? payload.credits : [];
  const expiries = credits
    .filter((credit) => credit && typeof credit === "object" && (credit as Record<string, unknown>).status === "available")
    .map((credit) => (credit as Record<string, unknown>).expires_at)
    .filter((expiresAt): expiresAt is string => typeof expiresAt === "string");
  resetCredits.resetsAt = expiries.length ? expiries.sort()[0] : null;
}

async function fetchKimiCodingUsage() {
  if (!kimiCodingApiKey) {
    return providerResult("missing-key", "Kimi Coding Plan", "配置 KIMI_CODING_API_KEY 后可查看 Kimi Coding Plan 用量。");
  }

  try {
    const response = await fetch(kimiUsageUrl, {
      headers: {
        authorization: `Bearer ${kimiCodingApiKey}`,
        accept: "application/json",
        "user-agent": "ai-workbench/0.1.0",
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return providerResult("error", "Kimi Coding Plan", extractError(payload, "Kimi Coding Plan 用量查询失败"));

    const windows = parseKimiWindows(payload);
    if (!windows.length) return providerResult("error", "Kimi Coding Plan", "已连通，但没有识别到 Kimi 用量窗口。");
    return providerResult("ready", "Kimi Coding Plan", "Kimi Coding Plan 用量已更新。", windows);
  } catch {
    return providerResult("error", "Kimi Coding Plan", "Kimi Coding Plan 用量查询失败，请检查网络或 Key。");
  }
}

async function fetchCodexUsage() {
  if (!codexAccessToken) {
    return providerResult("missing-key", "Codex / GPT Coding", "配置 CODEX_ACCESS_TOKEN 后可查看 Codex / GPT Coding 订阅用量。");
  }

  try {
    const response = await fetch(codexUsageUrl, {
      headers: { authorization: `Bearer ${codexAccessToken}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return providerResult("error", "Codex / GPT Coding", extractError(payload, "Codex / GPT Coding 用量查询失败"));

    const windows = parseCodexWindows(payload);
    if (!windows.length) return providerResult("error", "Codex / GPT Coding", "已连通，但没有识别到 Codex 用量窗口。");
    await attachResetCreditExpiry(windows);
    return providerResult("ready", "Codex / GPT Coding", "Codex / GPT Coding 用量已更新。", windows);
  } catch {
    return providerResult("error", "Codex / GPT Coding", "Codex / GPT Coding 用量查询失败，请检查网络或 token。");
  }
}

export async function GET() {
  const [kimi, codex] = await Promise.all([fetchKimiCodingUsage(), fetchCodexUsage()]);

  return Response.json({
    fetchedAt: new Date().toISOString(),
    kimi,
    codex,
  });
}
