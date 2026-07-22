type ProviderStatus = "ready" | "missing-key" | "error";

type MoneyMap = Map<string, number>;

const kimiBalanceBaseUrl = (process.env.KIMI_BALANCE_BASE_URL ?? "https://api.moonshot.cn/v1").replace(/\/+$/, "");
const openAiBaseUrl = (process.env.OPENAI_BASE_URL ?? "").toLowerCase();
const kimiApiKey =
  process.env.KIMI_API_KEY || (openAiBaseUrl.includes("kimi") || openAiBaseUrl.includes("moonshot") ? process.env.OPENAI_API_KEY : "");
const openAiAdminKey = process.env.OPENAI_ADMIN_KEY;
const openAiUsageDays = Math.max(1, Math.min(90, Number(process.env.OPENAI_USAGE_DAYS ?? 30) || 30));

function providerResult(status: ProviderStatus, label: string, message: string, extra: Record<string, unknown> = {}) {
  return { status, label, message, ...extra };
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

function findNumericBalance(payload: unknown): { value: number; currency: string } | null {
  const roots = [payload];
  if (payload && typeof payload === "object" && "data" in payload) roots.push(payload.data);

  for (const root of roots) {
    if (!root || typeof root !== "object") continue;
    const record = root as Record<string, unknown>;
    const value =
      record.available_balance ??
      record.balance ??
      record.total_balance ??
      record.cash_balance ??
      record.granted_balance;
    if (typeof value === "number") return { value, currency: typeof record.currency === "string" ? record.currency : "CNY" };
    if (typeof value === "string" && !Number.isNaN(Number(value))) {
      return { value: Number(value), currency: typeof record.currency === "string" ? record.currency : "CNY" };
    }
  }

  return null;
}

function formatMoney(value: number, currency: string) {
  return `${value.toFixed(2)} ${currency.toUpperCase()}`;
}

function addMoney(target: MoneyMap, currency: string, value: number) {
  target.set(currency, (target.get(currency) ?? 0) + value);
}

function formatMoneyMap(values: MoneyMap) {
  if (!values.size) return "0.00 USD";
  return [...values.entries()].map(([currency, value]) => formatMoney(value, currency)).join(" + ");
}

function dateFromSeconds(seconds: unknown) {
  if (typeof seconds !== "number") return "";
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function collectOpenAiCosts(payload: unknown) {
  const buckets = payload && typeof payload === "object" && "data" in payload && Array.isArray(payload.data) ? payload.data : [];
  const total = new Map<string, number>();

  const daily = buckets.map((bucket) => {
    const dayTotal = new Map<string, number>();
    const results = bucket && typeof bucket === "object" && "results" in bucket && Array.isArray(bucket.results) ? bucket.results : [];
    for (const result of results) {
      if (!result || typeof result !== "object" || !("amount" in result)) continue;
      const amount = result.amount;
      if (!amount || typeof amount !== "object") continue;
      const value = "value" in amount && typeof amount.value === "number" ? amount.value : 0;
      const currency = "currency" in amount && typeof amount.currency === "string" ? amount.currency : "USD";
      addMoney(dayTotal, currency, value);
      addMoney(total, currency, value);
    }

    return {
      date: dateFromSeconds(bucket && typeof bucket === "object" && "start_time" in bucket ? bucket.start_time : undefined),
      amount: formatMoneyMap(dayTotal),
    };
  });

  return { total: formatMoneyMap(total), buckets: daily.filter((bucket) => bucket.date).slice(-14) };
}

async function fetchKimiBalance() {
  if (!kimiApiKey) {
    return providerResult("missing-key", "Kimi", "配置 KIMI_API_KEY 后可查看 Kimi 账户余额。");
  }

  try {
    const response = await fetch(`${kimiBalanceBaseUrl}/users/me/balance`, {
      headers: { authorization: `Bearer ${kimiApiKey}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return providerResult("error", "Kimi", extractError(payload, "Kimi 余额查询失败"));

    const balance = findNumericBalance(payload);
    if (!balance) return providerResult("ready", "Kimi", "已连通，但返回中没有识别到标准余额字段。");

    return providerResult("ready", "Kimi", "余额已更新。", {
      balance: formatMoney(balance.value, balance.currency),
    });
  } catch {
    return providerResult("error", "Kimi", "Kimi 余额查询失败，请检查网络、Key 或接口地址。");
  }
}

async function fetchOpenAiCosts() {
  if (!openAiAdminKey) {
    return providerResult(
      "missing-key",
      "OpenAI",
      "配置 OPENAI_ADMIN_KEY 后可查看 OpenAI API 近期开销；ChatGPT App 订阅剩余消息数暂不支持公开 API 查询。",
    );
  }

  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - openAiUsageDays * 24 * 60 * 60;
  const url = new URL("https://api.openai.com/v1/organization/costs");
  url.searchParams.set("start_time", String(startTime));
  url.searchParams.set("end_time", String(endTime));
  url.searchParams.set("bucket_width", "1d");
  url.searchParams.set("limit", String(openAiUsageDays));

  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${openAiAdminKey}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return providerResult("error", "OpenAI", extractError(payload, "OpenAI 用量查询失败"));

    const costs = collectOpenAiCosts(payload);
    return providerResult("ready", "OpenAI", "API 开销已更新。", {
      period: `近 ${openAiUsageDays} 天`,
      total: costs.total,
      buckets: costs.buckets,
    });
  } catch {
    return providerResult("error", "OpenAI", "OpenAI 用量查询失败，请检查 Admin Key 或网络。");
  }
}

export async function GET() {
  const [kimi, openai] = await Promise.all([fetchKimiBalance(), fetchOpenAiCosts()]);

  return Response.json({
    fetchedAt: new Date().toISOString(),
    kimi,
    openai,
  });
}
