export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathname = url.pathname;

    /*
    =========================================================
    1. API SELALU DITERUSKAN
    =========================================================
    */

    if (pathname === "/api" || pathname.startsWith("/api/")) {
        return context.next();
    }

    /*
    =========================================================
    2. FILE LOGIN SELALU PUBLIC
       TIDAK BOLEH DICEK SESSION
       TIDAK BOLEH REDIRECT
    =========================================================
    */

    if (
        pathname === "/autentikasi-zws-panel/login.html" ||
        pathname === "/autentikasi-zws-panel/login.js"
    ) {
        return context.next();
    }

    /*
    =========================================================
    3. HANYA AREA PANEL YANG DILINDUNGI
    =========================================================
    */

    const isPanel =
        pathname === "/autentikasi-zws-panel" ||
        pathname.startsWith(
            "/autentikasi-zws-panel/"
        );

    if (!isPanel) {
        return context.next();
    }

    /*
    =========================================================
    4. PASTIKAN SECRET TERSEDIA
    =========================================================
    */

    if (!env.ADMIN_PASSWORD) {
        console.error(
            "ZWS AUTH: ADMIN_PASSWORD tidak tersedia."
        );

        return new Response(
            "Konfigurasi autentikasi ZWS belum tersedia.",
            {
                status: 500,
                headers: {
                    "Content-Type":
                        "text/plain; charset=utf-8",
                    "Cache-Control":
                        "no-store"
                }
            }
        );
    }

    /*
    =========================================================
    5. AMBIL COOKIE
    =========================================================
    */

    const cookieHeader =
        request.headers.get("Cookie") || "";

    const token =
        getCookie(
            cookieHeader,
            "zws_auth"
        );

    /*
    =========================================================
    6. BELUM LOGIN
    =========================================================
    */

    if (!token) {
        return redirectToLogin(url);
    }

    /*
    =========================================================
    7. VALIDASI SESSION
    =========================================================
    */

    try {
        const session =
            await verifySession(
                token,
                env.ADMIN_PASSWORD
            );

        if (!session) {
            return redirectToLogin(url);
        }

        /*
        =====================================================
        8. SESSION VALID
        =====================================================
        */

        return context.next();

    } catch (error) {
        console.error(
            "ZWS AUTH MIDDLEWARE ERROR:",
            error
        );

        return redirectToLogin(url);
    }
}


/*
===========================================================
COOKIE
===========================================================
*/

function getCookie(
    cookieHeader,
    name
) {
    const parts =
        cookieHeader.split(";");

    for (const part of parts) {
        const index =
            part.indexOf("=");

        if (index === -1) {
            continue;
        }

        const key =
            part
                .slice(0, index)
                .trim();

        if (key !== name) {
            continue;
        }

        return part
            .slice(index + 1)
            .trim();
    }

    return null;
}


/*
===========================================================
VERIFY SESSION
===========================================================
*/

async function verifySession(
    token,
    secret
) {
    if (
        !token ||
        !secret
    ) {
        return null;
    }

    const parts =
        token.split(".");

    if (
        parts.length !== 2 ||
        !parts[0] ||
        !parts[1]
    ) {
        return null;
    }

    const encodedPayload =
        parts[0];

    const receivedSignature =
        parts[1];

    /*
    ========================================================
    BUAT ULANG SIGNATURE
    ========================================================
    */

    const expectedSignature =
        await sign(
            encodedPayload,
            secret
        );

    /*
    ========================================================
    BANDINKAN SIGNATURE
    ========================================================
    */

    if (
        !constantTimeEqual(
            receivedSignature,
            expectedSignature
        )
    ) {
        return null;
    }

    /*
    ========================================================
    DECODE PAYLOAD
    ========================================================
    */

    let payload;

    try {
        payload =
            JSON.parse(
                fromBase64Url(
                    encodedPayload
                )
            );
    } catch {
        return null;
    }

    /*
    ========================================================
    VALIDASI PAYLOAD
    ========================================================
    */

    if (
        !payload ||
        typeof payload !== "object"
    ) {
        return null;
    }

    if (
        !payload.username ||
        !payload.exp
    ) {
        return null;
    }

    /*
    ========================================================
    CEK EXPIRED
    ========================================================
    */

    const now =
        Math.floor(
            Date.now() / 1000
        );

    if (
        Number(payload.exp) <= now
    ) {
        return null;
    }

    return payload;
}


/*
===========================================================
HMAC SHA-256
===========================================================
*/

async function sign(
    value,
    secret
) {
    const encoder =
        new TextEncoder();

    const key =
        await crypto.subtle.importKey(
            "raw",
            encoder.encode(secret),
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
            encoder.encode(value)
        );

    return toBase64Url(
        new Uint8Array(
            signature
        )
    );
}


/*
===========================================================
BASE64URL ENCODE
===========================================================
*/

function toBase64Url(bytes) {
    let binary = "";

    for (
        let i = 0;
        i < bytes.length;
        i++
    ) {
        binary +=
            String.fromCharCode(
                bytes[i]
            );
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}


/*
===========================================================
BASE64URL DECODE
===========================================================
*/

function fromBase64Url(value) {
    let base64 =
        value
            .replace(/-/g, "+")
            .replace(/_/g, "/");

    while (
        base64.length % 4 !== 0
    ) {
        base64 += "=";
    }

    return atob(base64);
}


/*
===========================================================
CONSTANT-TIME COMPARE
===========================================================
*/

function constantTimeEqual(
    a,
    b
) {
    if (
        typeof a !== "string" ||
        typeof b !== "string"
    ) {
        return false;
    }

    if (
        a.length !== b.length
    ) {
        return false;
    }

    let result = 0;

    for (
        let i = 0;
        i < a.length;
        i++
    ) {
        result |=
            a.charCodeAt(i) ^
            b.charCodeAt(i);
    }

    return result === 0;
}


/*
===========================================================
REDIRECT LOGIN
===========================================================
*/

function redirectToLogin(url) {
    const loginUrl =
        new URL(
            "/autentikasi-zws-panel/login.html",
            url.origin
        );

    /*
    Jangan terus-menerus menambahkan
    redirect=login.html.
    */

    const requestedPath =
        url.pathname +
        url.search;

    if (
        requestedPath &&
        requestedPath !==
            "/autentikasi-zws-panel/login.html"
    ) {
        loginUrl.searchParams.set(
            "redirect",
            requestedPath
        );
    }

    return Response.redirect(
        loginUrl.toString(),
        302
    );
}
