// receipt-proxy.js — レシート読み取りの中継サーバー（Cloudflare Workers）
//
// ・アプリ → このサーバー → Gemini API の順に中継します（API キーはサーバーの中だけ。アプリには入れません）
// ・1台（deviceId）につき、日本時間で1日1回まで。同じ回線(IP)からの連打も上限で止めます
// ・画像はメモリ上で Gemini に渡すだけ。保存も、ログへの出力もしません
//   （カウント用に KV へ置くのは「日付 + ハッシュ化した端末ID/IP」と回数だけ）
//
// 必要な設定は README.md を見てください。

function buildReceiptPrompt() {
    return [
        "このレシート画像を読み取り、次のJSONだけを出力してください。",
        "説明文・前置き・Markdownのコードフェンスは一切書かないでください。",
        "",
        "{",
        '  "store": "店舗名（読み取れなければ空文字）",',
        '  "date": "YYYY-MM-DD 形式。不明なら空文字",',
        '  "subtotal": 小計（数値。不明なら0）,',
        '  "tax8": 8%対象の消費税額（数値。不明なら0）,',
        '  "tax10": 10%対象の消費税額（数値。不明なら0）,',
        '  "total": 合計金額（数値。必ず入れる）,',
        '  "items": [',
        '    { "name": "品目名", "price": 金額, "qty": 数量, "taxRate": 8または10, "type": "item" }',
        "  ]",
        "}",
        "",
        "注意事項：",
        "・割引や値引きの行は type を \"discount\" にし、price を負の数にしてください。",
        "・軽減税率（8%）と 10% が混在している場合は taxRate を品目ごとに分けてください。",
        "・「小計」「消費税」「合計」の行は items に含めず、それぞれの項目に入れてください。",
        "・読み取れない品目は無理に作らず、確実なものだけ入れてください。",
        "・金額はすべて円単位の整数にしてください。"
    ].join("\n");
}

const DAILY_LIMIT_PER_DEVICE = 1;
const DAILY_LIMIT_PER_IP = 10;       // 学校や会社など、同じ回線を使う人が多い場合の保険
const MAX_IMAGE_BASE64_CHARS = 2_500_000;   // 約1.8MB。アプリ側で縮小済みなので十分

function corsHeaders(env, request) {
    const allowed = env.ALLOWED_ORIGIN || "*";
    const origin = request.headers.get("Origin") || "";
    return {
        "Access-Control-Allow-Origin": allowed === "*" ? "*" : (origin === allowed ? origin : allowed),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin"
    };
}

function json(body, status, cors) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors }
    });
}

async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function jstDate() {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export default {
    async fetch(request, env) {
        const cors = corsHeaders(env, request);
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
        if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

        let body;
        try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, 400, cors); }
        const image = typeof body.image === "string" ? body.image : "";
        const deviceId = typeof body.deviceId === "string" ? body.deviceId.slice(0, 80) : "";
        if (!image || image.length > MAX_IMAGE_BASE64_CHARS || !deviceId) return json({ error: "bad_request" }, 400, cors);

        // --- 1日の回数チェック（先に数えてから Gemini を呼ぶ） ---
        const day = jstDate();
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const devKey = `d:${day}:${await sha256(deviceId)}`;
        const ipKey = `i:${day}:${await sha256(ip)}`;
        const [devCount, ipCount] = await Promise.all([
            env.RATE.get(devKey).then(v => parseInt(v || "0", 10)),
            env.RATE.get(ipKey).then(v => parseInt(v || "0", 10))
        ]);
        if (devCount >= DAILY_LIMIT_PER_DEVICE || ipCount >= DAILY_LIMIT_PER_IP) {
            return json({ error: "daily_limit" }, 429, cors);
        }
        const ttl = { expirationTtl: 172800 };   // 2日で自動的に消える
        await Promise.all([
            env.RATE.put(devKey, String(devCount + 1), ttl),
            env.RATE.put(ipKey, String(ipCount + 1), ttl)
        ]);

        // --- Gemini へ中継（画像は保存しない） ---
        const model = env.GEMINI_MODEL || "gemini-2.5-flash";
        let res;
        try {
            res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: buildReceiptPrompt() }, { inline_data: { mime_type: "image/jpeg", data: image } }] }],
                    generationConfig: { temperature: 0, responseMimeType: "application/json" }
                })
            });
        } catch (e) {
            await env.RATE.put(devKey, String(devCount), ttl);   // 失敗した分は数えない
            return json({ error: "upstream_unreachable" }, 502, cors);
        }
        if (!res.ok) {
            await env.RATE.put(devKey, String(devCount), ttl);
            return json({ error: "upstream_error" }, 502, cors);
        }
        const data = await res.json();
        let text = "";
        try { text = data.candidates[0].content.parts.map(p => p.text || "").join(""); } catch (e) { /* 空のまま返す */ }
        return json({ text }, 200, cors);
    }
};
