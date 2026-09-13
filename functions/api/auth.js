const COOKIE_NAME = "zws_auth";
const SESSION_DAYS = 7;

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    try {
        if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
            return json({
                success: false,
                error: "ADMIN_USERNAME atau ADMIN_PASSWORD belum dikonfigurasi di Cloudflare."
            }, 500);
        }

        if (request.method === "POST") {
            const action = url.searchParams.get("action");

            if (action === "logout") {
                return logout();
            }

            return await login(request, env);
        }

        if (request.method === "GET") {
            const action = url.searchParams.get("action");

            if (action === "session") {
                return await checkSession(request, env);
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
        console.error("ZWS AUTH ERROR:", error);

        return json({
            success: false,
            error: "Terjadi kesalahan pada server autentikasi."
        }, 500);
    }
}


/* ==================================================
   LOGIN
================================================== */

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

    const username = String(
        body.username || ""
    ).trim();

    const password = String(
        body.password || ""
    );

    if (!username || !password) {
        return json({
            success: false,
            error: "Username dan password wajib diisi."
        }, 400);
    }

    if (username !== env.ADMIN_USERNAME) {
        return invalidLogin();
    }

    if (password !== env.ADMIN_PASSWORD) {
        return invalidLogin();
    }

    const session = {
        username: env.ADMIN_USERNAME,
        role: "admin",
        exp:
            Math.floor(Date.now() / 1000) +
            SESSION_DAYS * 86400
    };

    const token = await createToken(
        session,
        env.ADMIN_PASSWORD
    );

    if (!token) {
        return json({
            success: false,
            error: "Session gagal dibuat."
        }, 500);
    }

    const headers = {
        "Cache-Control": "no-store",
        "Set-Cookie": createCookie(token)
    };

    return json({
        success: true,
        authenticated: true,
        user: {
            username: env.ADMIN_USERNAME,
            display_name: env.ADMIN_USERNAME,
            role: "admin"
        }
    }, 200, headers);
}


/* ==================================================
   INVALID LOGIN
================================================== */

function invalidLogin() {
    return json({
        success: false,
        authenticated: false,
        error: "Username atau password salah."
    }, 401);
}


/* ==================================================
   CHECK SESSION
================================================== */

async function checkSession(request, env) {
    const cookies = parseCookies(
        request.headers.get("Cookie") || ""
    );

    const token = cookies[COOKIE_NAME];

    if (!token) {
        return json({
            success: true,
            authenticated: false
        });
    }

    const session = await verifyToken(
        token,
        env.ADMIN_PASSWORD
    );

    if (!session) {
        return json({
            success: true,
            authenticated: false
        }, 200, {
            "Set-Cookie": clearCookie()
        });
    }

    if (
        session.username !==
        env.ADMIN_USERNAME
    ) {
        return json({
            success: true,
            authenticated: false
        }, 200, {
            "Set-Cookie": clearCookie()
        });
    }

    return json({
        success: true,
        authenticated: true,
        user: {
            username: env.ADMIN_USERNAME,
            display_name: env.ADMIN_USERNAME,
            role: "admin"
        }
    });
}


/* ==================================================
   LOGOUT
================================================== */

function logout() {
    return json({
        success: true,
        authenticated: false,
        message: "Berhasil logout."
    }, 200, {
        "Set-Cookie": clearCookie()
    });
}


/* ==================================================
   CREATE SESSION TOKEN
================================================== */

async function createToken(payload, secret) {
    try {
        const payloadText =
            JSON.stringify(payload);

        const encodedPayload =
            base64UrlEncode(
                new TextEncoder().encode(
                    payloadText
                )
            );

        const signature =
            await sign(
                encodedPayload,
                secret
            );

        return (
            encodedPayload +
            "." +
            signature
        );

    } catch (error) {
        console.error(
            "CREATE TOKEN ERROR:",
            error
        );

        return null;
    }
}


/* ==================================================
   VERIFY SESSION TOKEN
================================================== */

async function verifyToken(token, secret) {
    try {
        const parts = token.split(".");

        if (parts.length !== 2) {
            return null;
        }

        const [
            encodedPayload,
            receivedSignature
        ] = parts;

        const expectedSignature =
            await sign(
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

        const payload =
            JSON.parse(
                new TextDecoder().decode(
                    base64UrlDecode(
                        encodedPayload
                    )
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


/* ==================================================
   HMAC SHA-256
================================================== */

async function sign(value, secret) {
    const key =
        await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(
                secret
            ),
            {
                name: "HMAC",
                hash: "SHA-256"
            },
            false,
            ["sign"]
        );

    const signature =
        await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(
                value
            )
        );

    return base64UrlEncode(
        new Uint8Array(signature)
    );
}


/* ==================================================
   COOKIE
================================================== */

function createCookie(token) {
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


/* ==================================================
   PARSE COOKIE
================================================== */

function parseCookies(cookieHeader) {
    const cookies = {};

    cookieHeader
        .split(";")
        .forEach(part => {
            const index =
                part.indexOf("=");

            if (index === -1) {
                return;
            }

            const name =
                part
                    .slice(0, index)
                    .trim();

            const value =
                part
                    .slice(index + 1)
                    .trim();

            if (name) {
                cookies[name] = value;
            }
        });

    return cookies;
}


/* ==================================================
   BASE64URL
================================================== */

function base64UrlEncode(bytes) {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(
            byte
        );
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}


function base64UrlDecode(value) {
    const base64 =
        value
            .replace(/-/g, "+")
            .replace(/_/g, "/");

    const padded =
        base64 +
        "=".repeat(
            (4 - (base64.length % 4)) % 4
        );

    const binary =
        atob(padded);

    const bytes =
        new Uint8Array(
            binary.length
        );

    for (
        let i = 0;
        i < binary.length;
        i++
    ) {
        bytes[i] =
            binary.charCodeAt(i);
    }

    return bytes;
}


/* ==================================================
   CONSTANT TIME COMPARE
================================================== */

function constantTimeEqual(a, b) {
    if (a.length !== b.length) {
        return false;
    }

    let result = 0;

    for (
        let i = 0;
        i < a.length;
        i++
    ) {
        result |=
            a[i] ^ b[i];
    }

    return result === 0;
}


function constantTimeStringEqual(a, b) {
    const encoder =
        new TextEncoder();

    return constantTimeEqual(
        encoder.encode(a),
        encoder.encode(b)
    );
}


/* ==================================================
   JSON RESPONSE
================================================== */

function json(
    data,
    status = 200,
    extraHeaders = {}
) {
    const headers =
        new Headers({
            "Content-Type":
                "application/json; charset=utf-8",
            "Cache-Control":
                "no-store",
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
