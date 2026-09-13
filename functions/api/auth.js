const COOKIE_NAME = "zws_auth";
const SESSION_DAYS = 7;
const PBKDF2_ITERATIONS = 120000;

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    if (!env.ZWS_DB) {
        return json({
            success: false,
            error: "D1 binding ZWS_DB belum tersedia."
        }, 500);
    }

    try {
        if (request.method === "POST") {
            if (url.searchParams.get("action") === "logout") {
                return logoutResponse();
            }

            if (url.searchParams.get("action") === "setup") {
                return await setupAdmin(request, env);
            }

            return await login(request, env);
        }

        if (request.method === "GET") {
            if (url.searchParams.get("action") === "session") {
                return await getSession(request, env);
            }

            return json({
                success: true,
                service: "ZWS Authentication API",
                status: "online"
            });
        }

        return json({
            success: false,
            error: "Method tidak diizinkan."
        }, 405);

    } catch (error) {
        console.error("AUTH ERROR:", error);

        return json({
            success: false,
            error: "Terjadi kesalahan pada server autentikasi."
        }, 500);
    }
}


/* =========================================================
   LOGIN
========================================================= */

async function login(request, env) {
    let body;

    try {
        body = await request.json();
    } catch {
        return json({
            success: false,
            error: "Data login tidak valid."
        }, 400);
    }

    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!username || !password) {
        return json({
            success: false,
            error: "Username dan password wajib diisi."
        }, 400);
    }

    if (username.length > 100 || password.length > 500) {
        return json({
            success: false,
            error: "Data login tidak valid."
        }, 400);
    }

    const user = await env.ZWS_DB
        .prepare(`
            SELECT
                id,
                username,
                password_hash,
                display_name,
                role,
                is_active
            FROM admin_users
            WHERE username = ?
            LIMIT 1
        `)
        .bind(username)
        .first();

    if (!user || Number(user.is_active) !== 1) {
        return json({
            success: false,
            error: "Username atau password salah."
        }, 401);
    }

    const validPassword = await verifyPassword(
        password,
        user.password_hash
    );

    if (!validPassword) {
        return json({
            success: false,
            error: "Username atau password salah."
        }, 401);
    }

    const session = {
        id: Number(user.id),
        username: user.username,
        display_name: user.display_name || user.username,
        role: user.role || "admin",
        exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400
    };

    const token = await createSessionToken(
        session,
        env.ZWS_AUTH_SECRET
    );

    if (!token) {
        return json({
            success: false,
            error: "ZWS_AUTH_SECRET belum dikonfigurasi."
        }, 500);
    }

    const headers = new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": buildCookie(token)
    });

    return new Response(
        JSON.stringify({
            success: true,
            authenticated: true,
            user: {
                id: session.id,
                username: session.username,
                display_name: session.display_name,
                role: session.role
            }
        }),
        {
            status: 200,
            headers
        }
    );
}


/* =========================================================
   SESSION
========================================================= */

async function getSession(request, env) {
    const cookies = parseCookies(
        request.headers.get("Cookie") || ""
    );

    const token = cookies[COOKIE_NAME];

    if (!token) {
        return json({
            success: true,
            authenticated: false
        }, 200, {
            "Cache-Control": "no-store"
        });
    }

    const session = await verifySessionToken(
        token,
        env.ZWS_AUTH_SECRET
    );

    if (!session) {
        return json({
            success: true,
            authenticated: false
        }, 200, {
            "Cache-Control": "no-store",
            "Set-Cookie": clearCookie()
        });
    }

    const user = await env.ZWS_DB
        .prepare(`
            SELECT
                id,
                username,
                display_name,
                role,
                is_active
            FROM admin_users
            WHERE id = ?
            LIMIT 1
        `)
        .bind(session.id)
        .first();

    if (!user || Number(user.is_active) !== 1) {
        return json({
            success: true,
            authenticated: false
        }, 200, {
            "Cache-Control": "no-store",
            "Set-Cookie": clearCookie()
        });
    }

    return json({
        success: true,
        authenticated: true,
        user: {
            id: Number(user.id),
            username: user.username,
            display_name: user.display_name || user.username,
            role: user.role || "admin"
        }
    }, 200, {
        "Cache-Control": "no-store"
    });
}


/* =========================================================
   LOGOUT
========================================================= */

function logoutResponse() {
    return json({
        success: true,
        authenticated: false,
        message: "Berhasil logout."
    }, 200, {
        "Cache-Control": "no-store",
        "Set-Cookie": clearCookie()
    });
}


/* =========================================================
   SETUP ADMIN PERTAMA
========================================================= */

async function setupAdmin(request, env) {
    if (!env.ZWS_SETUP_KEY) {
        return json({
            success: false,
            error: "ZWS_SETUP_KEY belum dikonfigurasi."
        }, 500);
    }

    const setupKey = request.headers.get("X-ZWS-Setup-Key");

    if (!setupKey || !safeEqual(setupKey, env.ZWS_SETUP_KEY)) {
        return json({
            success: false,
            error: "Setup key tidak valid."
        }, 403);
    }

    const existing = await env.ZWS_DB
        .prepare(`
            SELECT COUNT(*) AS total
            FROM admin_users
        `)
        .first();

    const total = Number(existing?.total || 0);

    if (total > 0) {
        return json({
            success: false,
            error: "Admin sudah tersedia. Setup pertama tidak dapat digunakan lagi."
        }, 409);
    }

    let body;

    try {
        body = await request.json();
    } catch {
        return json({
            success: false,
            error: "Data setup tidak valid."
        }, 400);
    }

    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const displayName = String(
        body.display_name || username
    ).trim();

    if (!username || !password) {
        return json({
            success: false,
            error: "Username dan password wajib diisi."
        }, 400);
    }

    if (username.length < 3 || username.length > 100) {
        return json({
            success: false,
            error: "Username harus 3–100 karakter."
        }, 400);
    }

    if (password.length < 8) {
        return json({
            success: false,
            error: "Password minimal 8 karakter."
        }, 400);
    }

    if (password.length > 500) {
        return json({
            success: false,
            error: "Password terlalu panjang."
        }, 400);
    }

    const passwordHash = await hashPassword(password);

    const result = await env.ZWS_DB
        .prepare(`
            INSERT INTO admin_users (
                username,
                password_hash,
                display_name,
                role,
                is_active
            )
            VALUES (?, ?, ?, 'admin', 1)
        `)
        .bind(
            username,
            passwordHash,
            displayName
        )
        .run();

    return json({
        success: true,
        message: "Admin pertama berhasil dibuat.",
        user: {
            id: result.meta?.last_row_id || null,
            username,
            display_name: displayName,
            role: "admin"
        }
    }, 201, {
        "Cache-Control": "no-store"
    });
}


/* =========================================================
   PASSWORD HASH
   PBKDF2-SHA256
========================================================= */

async function hashPassword(password) {
    const salt = crypto.getRandomValues(
        new Uint8Array(16)
    );

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        {
            name: "PBKDF2"
        },
        false,
        ["deriveBits"]
    );

    const derived = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt,
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256"
        },
        key,
        256
    );

    return [
        "pbkdf2",
        "sha256",
        PBKDF2_ITERATIONS,
        bytesToBase64Url(salt),
        bytesToBase64Url(new Uint8Array(derived))
    ].join("$");
}


async function verifyPassword(password, storedHash) {
    try {
        const parts = String(storedHash).split("$");

        if (parts.length !== 5) {
            return false;
        }

        const [
            algorithm,
            hashAlgorithm,
            iterations,
            saltEncoded,
            hashEncoded
        ] = parts;

        if (
            algorithm !== "pbkdf2" ||
            hashAlgorithm !== "sha256"
        ) {
            return false;
        }

        const iterationCount = Number(iterations);

        if (
            !Number.isInteger(iterationCount) ||
            iterationCount < 10000 ||
            iterationCount > 1000000
        ) {
            return false;
        }

        const salt = base64UrlToBytes(
            saltEncoded
        );

        const expectedHash = base64UrlToBytes(
            hashEncoded
        );

        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(password),
            {
                name: "PBKDF2"
            },
            false,
            ["deriveBits"]
        );

        const derived = await crypto.subtle.deriveBits(
            {
                name: "PBKDF2",
                salt,
                iterations: iterationCount,
                hash: "SHA-256"
            },
            key,
            expectedHash.length * 8
        );

        return constantTimeEqual(
            new Uint8Array(derived),
            expectedHash
        );

    } catch {
        return false;
    }
}


/* =========================================================
   SESSION TOKEN
   HMAC-SHA256
========================================================= */

async function createSessionToken(payload, secret) {
    if (!secret) {
        return null;
    }

    const encodedPayload = bytesToBase64Url(
        new TextEncoder().encode(
            JSON.stringify(payload)
        )
    );

    const signature = await sign(
        encodedPayload,
        secret
    );

    return `${encodedPayload}.${signature}`;
}


async function verifySessionToken(token, secret) {
    try {
        if (!secret || !token) {
            return null;
        }

        const parts = token.split(".");

        if (parts.length !== 2) {
            return null;
        }

        const [
            encodedPayload,
            receivedSignature
        ] = parts;

        const expectedSignature = await sign(
            encodedPayload,
            secret
        );

        if (
            !constantTimeStringEqual(
                receivedSignature,
                expectedSignature
            )
        ) {
            return null;
        }

        const payload = JSON.parse(
            new TextDecoder().decode(
                base64UrlToBytes(encodedPayload)
            )
        );

        if (!payload.exp) {
            return null;
        }

        if (
            Number(payload.exp) <
            Math.floor(Date.now() / 1000)
        ) {
            return null;
        }

        return payload;

    } catch {
        return null;
    }
}


async function sign(value, secret) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        {
            name: "HMAC",
            hash: "SHA-256"
        },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(value)
    );

    return bytesToBase64Url(
        new Uint8Array(signature)
    );
}


/* =========================================================
   COOKIE
========================================================= */

function buildCookie(token) {
    return [
        `${COOKIE_NAME}=${token}`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        `Max-Age=${SESSION_DAYS * 86400}`
    ].join("; ");
}


function clearCookie() {
    return [
        `${COOKIE_NAME}=`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Max-Age=0"
    ].join("; ");
}


function parseCookies(cookieHeader) {
    const cookies = {};

    cookieHeader
        .split(";")
        .forEach(part => {
            const index = part.indexOf("=");

            if (index === -1) {
                return;
            }

            const name = part
                .slice(0, index)
                .trim();

            const value = part
                .slice(index + 1)
                .trim();

            if (name) {
                cookies[name] = value;
            }
        });

    return cookies;
}


/* =========================================================
   BASE64URL
========================================================= */

function bytesToBase64Url(bytes) {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}


function base64UrlToBytes(value) {
    const base64 = value
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const padded =
        base64 +
        "=".repeat(
            (4 - (base64.length % 4)) % 4
        );

    const binary = atob(padded);

    const bytes = new Uint8Array(
        binary.length
    );

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}


/* =========================================================
   CONSTANT-TIME COMPARE
========================================================= */

function constantTimeEqual(a, b) {
    if (a.length !== b.length) {
        return false;
    }

    let result = 0;

    for (let i = 0; i < a.length; i++) {
        result |= a[i] ^ b[i];
    }

    return result === 0;
}


function constantTimeStringEqual(a, b) {
    const encoder = new TextEncoder();

    return constantTimeEqual(
        encoder.encode(a),
        encoder.encode(b)
    );
}


/* =========================================================
   SETUP KEY COMPARE
========================================================= */

function safeEqual(a, b) {
    const encoder = new TextEncoder();

    return constantTimeEqual(
        encoder.encode(String(a)),
        encoder.encode(String(b))
    );
}


/* =========================================================
   JSON RESPONSE
========================================================= */

function json(data, status = 200, extraHeaders = {}) {
    const headers = new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...extraHeaders
    });

    return new Response(
        JSON.stringify(data),
        {
            status,
            headers
        }
    );
}
