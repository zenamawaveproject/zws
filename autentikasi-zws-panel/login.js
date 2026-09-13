(() => {
    "use strict";

    /* ==================================================
       KONFIGURASI
    ================================================== */

    const AUTH_API = "/api/auth";
    const PANEL_URL = "/autentikasi-zws-panel/";
    const LOGIN_URL = "/autentikasi-zws-panel/login.html";


    /* ==================================================
       ELEMENT
    ================================================== */

    const form = document.getElementById("login-form");

    const usernameInput =
        document.getElementById("username");

    const passwordInput =
        document.getElementById("password");

    const rememberInput =
        document.getElementById("remember");

    const submitButton =
        document.getElementById("login-submit");

    const submitText =
        document.getElementById("login-submit-text");

    const submitLoader =
        document.getElementById("login-submit-loader");

    const submitIcon =
        document.getElementById("login-submit-icon");

    const errorBox =
        document.getElementById("login-error");

    const errorText =
        document.getElementById("login-error-text");

    const togglePassword =
        document.getElementById("toggle-password");


    /* ==================================================
       ERROR
    ================================================== */

    function showError(message) {
        if (!errorBox || !errorText) {
            return;
        }

        errorText.textContent = message;

        errorBox.classList.remove(
            "hidden"
        );
    }


    function hideError() {
        if (!errorBox) {
            return;
        }

        errorBox.classList.add(
            "hidden"
        );
    }


    /* ==================================================
       LOADING
    ================================================== */

    function setLoading(loading) {
        if (!submitButton) {
            return;
        }

        submitButton.disabled = loading;

        if (submitText) {
            submitText.textContent =
                loading
                    ? "Memproses..."
                    : "Masuk ke Panel";
        }

        if (submitLoader) {
            submitLoader.classList.toggle(
                "hidden",
                !loading
            );
        }

        if (submitIcon) {
            submitIcon.classList.toggle(
                "hidden",
                loading
            );
        }
    }


    /* ==================================================
       CEK SESSION
    ================================================== */

    async function checkSession() {
        try {
            const response = await fetch(
                `${AUTH_API}?action=session`,
                {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

            if (!response.ok) {
                return;
            }

            const data =
                await response.json();

            if (
                data &&
                data.success &&
                data.authenticated
            ) {
                window.location.replace(
                    PANEL_URL
                );
            }

        } catch (error) {
            console.warn(
                "ZWS session check gagal:",
                error
            );
        }
    }


    /* ==================================================
       TOGGLE PASSWORD
    ================================================== */

    if (
        togglePassword &&
        passwordInput
    ) {
        togglePassword.addEventListener(
            "click",
            () => {

                const isPassword =
                    passwordInput.type ===
                    "password";

                passwordInput.type =
                    isPassword
                        ? "text"
                        : "password";

                togglePassword.setAttribute(
                    "aria-label",
                    isPassword
                        ? "Sembunyikan password"
                        : "Tampilkan password"
                );

                togglePassword.innerHTML =
                    isPassword
                        ? '<i class="fa-regular fa-eye-slash"></i>'
                        : '<i class="fa-regular fa-eye"></i>';

            }
        );
    }


    /* ==================================================
       LOGIN
    ================================================== */

    if (form) {
        form.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                hideError();

                const username =
                    usernameInput
                        ? usernameInput.value.trim()
                        : "";

                const password =
                    passwordInput
                        ? passwordInput.value
                        : "";

                if (!username) {
                    showError(
                        "Username wajib diisi."
                    );

                    usernameInput?.focus();

                    return;
                }

                if (!password) {
                    showError(
                        "Password wajib diisi."
                    );

                    passwordInput?.focus();

                    return;
                }

                setLoading(true);

                try {

                    const response =
                        await fetch(
                            AUTH_API,
                            {
                                method: "POST",
                                credentials: "include",
                                cache: "no-store",
                                headers: {
                                    "Content-Type":
                                        "application/json",
                                    "Accept":
                                        "application/json"
                                },
                                body:
                                    JSON.stringify({
                                        username,
                                        password
                                    })
                            }
                        );


                    let data = null;

                    try {
                        data =
                            await response.json();
                    } catch {
                        data = null;
                    }


                    /* ==================================
                       LOGIN GAGAL
                    ================================== */

                    if (
                        !response.ok ||
                        !data ||
                        !data.success ||
                        !data.authenticated
                    ) {

                        throw new Error(
                            data?.error ||
                            "Username atau password salah."
                        );
                    }


                    /* ==================================
                       LOGIN BERHASIL
                    ==================================

                       Session dibuat oleh server
                       menggunakan HttpOnly cookie.

                       Tidak ada token yang disimpan
                       ke localStorage/sessionStorage.
                    ================================== */

                    window.location.replace(
                        PANEL_URL
                    );

                } catch (error) {

                    console.error(
                        "ZWS login error:",
                        error
                    );

                    showError(
                        error.message ||
                        "Login gagal. Silakan coba lagi."
                    );

                    setLoading(false);

                }

            }
        );
    }


    /* ==================================================
       INPUT EVENT
    ================================================== */

    if (usernameInput) {
        usernameInput.addEventListener(
            "input",
            () => {
                hideError();
            }
        );
    }


    if (passwordInput) {
        passwordInput.addEventListener(
            "input",
            () => {
                hideError();
            }
        );
    }


    /* ==================================================
       ENTER KEY
    ================================================== */

    if (usernameInput) {
        usernameInput.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" &&
                    passwordInput
                ) {
                    event.preventDefault();

                    passwordInput.focus();
                }

            }
        );
    }


    /* ==================================================
       START
    ================================================== */

    checkSession();

})();
