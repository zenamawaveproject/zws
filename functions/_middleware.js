export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathname = url.pathname;

    /*
    =========================================================
    1. API TIDAK BOLEH DICEGAT MIDDLEWARE
    =========================================================
    */

    if (pathname.startsWith("/api/")) {
        return context.next();
    }

    /*
    =========================================================
    2. HANYA PANEL YANG DILINDUNGI
    =========================================================
    */

    const panelPrefix = "/autentikasi-zws-panel";

    if (!pathname.startsWith(panelPrefix)) {
        return context.next();
    }

    /*
    =========================================================
    3. FILE PUBLIK PANEL
    =========================================================
    */

    const publicFiles = [
        "/autentikasi-zws-panel/login.html",
        "/autentikasi-zws-panel/login.js"
    ];

    if (publicFiles.includes(pathname)) {
        return context.next();
    }

    /*
    =========================================================
    4. AMBIL COOKIE SESSION
    =========================================================
    */

    const cookieHeader =
        request.headers.get("Cookie") || "";

    const sessionToken =
        getCookie(
            cookieHeader,
            "zws_auth"
        );

    /*
    =========================================================
    5. BELUM LOGIN
    =========================================================
    */

    if (!sessionToken) {
        return redirectToLogin(url);
    }

    /*
    =========================================================
    6. VALIDASI SESSION LANGSUNG
       TIDAK MEMANGGIL /api/auth LAGI
    =========================================================
    */

    try {

        const session =
            await verifySession(
                sessionToken,
                env.ADMIN_PASSWORD
            );

        if (!session) {
            return redirectToLogin(url);
        }

        /*
        =====================================================
        7. SESSION VALID
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
COOKIE PARSER
===========================================================
*/

function getCookie(cookieHeader, name) {

    const cookies =
        cookieHeader
            .split(";")
            .map(cookie => cookie.trim());

    for (const cookie of cookies) {

        const separator =
            cookie.indexOf("=");

        if (separator === -1) {
            continue;
        }

        const key =
            cookie.slice(
                0,
                separator
            );

        const value =
            cookie.slice(
                separator + 1
            );

        if (key === name) {
            return value;
        }
    }

    return null;
}


/*
===========================================================
SESSION VERIFICATION
===========================================================
*/

async function verifySession(
    token,
    password
) {

    if (!token || !password) {
        return null;
    }

    const parts =
        token.split(".");

    if (parts.length !== 2) {
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
            password
        );

    /*
    ========================================================
    CONSTANT-TIME COMPARISON
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

    } catch (error) {

        return null;
    }

    /*
    ========================================================
    CEK EXPIRATION
    ========================================================
    */

    if (
        !payload ||
        !payload.exp
    ) {
        return null;
    }

    const now =
        Math.floor(
            Date.now() / 1000
        );

    if (
        Number(payload.exp) <= now
    ) {
        return null;
    }

    /*
    ========================================================
    CEK USERNAME
    ========================================================
    */

    if (
        !payload.username
    ) {
        return null;
    }

    /*
    ========================================================
    SESSION VALID
    ========================================================
    */

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
                name:"HMAC",
                hash:"SHA-256"
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
        new Uint8Array(signature)
    );
}


/*
===========================================================
BASE64URL ENCODE
===========================================================
*/

function toBase64Url(bytes) {

    let binary="";

    for (
        let i=0;
        i<bytes.length;
        i++
    ) {
        binary +=
            String.fromCharCode(
                bytes[i]
            );
    }

    return btoa(binary)
        .replace(/\+/g,"-")
        .replace(/\//g,"_")
        .replace(/=+$/,"");
}


/*
===========================================================
BASE64URL DECODE
===========================================================
*/

function fromBase64Url(value) {

    let base64 =
        value
            .replace(/-/g,"+")
            .replace(/_/g,"/");

    while (
        base64.length % 4
    ) {
        base64 += "=";
    }

    return atob(base64);
}


/*
===========================================================
CONSTANT-TIME COMPARISON
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
        let i=0;
        i<a.length;
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
