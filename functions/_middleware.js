export async function onRequest(context) {
    const { request } = context;

    const url = new URL(request.url);
    const pathname = url.pathname;


    /* ==================================================
       API TIDAK DIKUNCI OLEH MIDDLEWARE INI

       /api/auth
       /api/cms
       dan API lainnya tetap diproses
       oleh Pages Functions masing-masing.
    ================================================== */

    if (pathname.startsWith("/api/")) {
        return context.next();
    }


    /* ==================================================
       HANYA PROTEKSI PANEL ZWS

       Semua URL di bawah:

       /autentikasi-zws-panel/

       akan diperiksa.

       Halaman login dan login.js tetap public.
    ================================================== */

    const panelPrefix =
        "/autentikasi-zws-panel";


    if (
        !pathname.startsWith(
            panelPrefix
        )
    ) {
        return context.next();
    }


    /* ==================================================
       FILE PUBLIC PANEL

       File yang harus bisa dibuka tanpa
       autentikasi.
    ================================================== */

    const publicFiles = [
        "/autentikasi-zws-panel/login.html",
        "/autentikasi-zws-panel/login.js"
    ];


    if (
        publicFiles.includes(pathname)
    ) {
        return context.next();
    }


    /* ==================================================
       CEK SESSION
    ================================================== */

    try {

        const authUrl =
            new URL(
                "/api/auth?action=session",
                url.origin
            );


        /*
         * Cookie dari request pengguna
         * diteruskan ke API authentication.
         */

        const authRequest =
            new Request(
                authUrl.toString(),
                {
                    method: "GET",
                    headers: {
                        "Cookie":
                            request.headers.get(
                                "Cookie"
                            ) || "",
                        "Accept":
                            "application/json"
                    }
                }
            );


        const authResponse =
            await fetch(
                authRequest
            );


        if (!authResponse.ok) {
            return redirectToLogin(
                url
            );
        }


        const data =
            await authResponse.json();


        /* ==============================================
           SESSION VALID
        ============================================== */

        if (
            data &&
            data.success &&
            data.authenticated === true
        ) {
            return context.next();
        }


        /* ==============================================
           SESSION TIDAK VALID
        ============================================== */

        return redirectToLogin(
            url
        );

    } catch (error) {

        console.error(
            "ZWS MIDDLEWARE AUTH ERROR:",
            error
        );


        /*
         * Jika sistem authentication mengalami
         * error, jangan berikan akses ke panel.
         */

        return redirectToLogin(
            url
        );
    }
}


/* ==================================================
   REDIRECT KE LOGIN
================================================== */

function redirectToLogin(url) {

    const loginUrl =
        new URL(
            "/autentikasi-zws-panel/login.html",
            url.origin
        );


    /*
     * Simpan halaman tujuan supaya
     * nantinya bisa dikembangkan menjadi:

     login → kembali ke halaman yang diminta.
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
