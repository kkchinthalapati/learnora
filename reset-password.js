import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://mlvgqwqiynpwpwzqufdf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mN1UvxPjHhn6L583LjrSFw_FWY8kRrt";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});

// DOM helpers
const $ = (id) => document.getElementById(id);
const show = (id) => $(id)?.classList.remove("hidden");
const hide = (id) => $(id)?.classList.add("hidden");

// Apply saved theme
const savedTheme = localStorage.getItem("learnora_theme");
if (savedTheme) {
    try {
        const theme = JSON.parse(savedTheme);
        if (theme === "light") document.body.classList.remove("dark-theme");
    } catch {}
}

// Popup helpers
$("btn-close-popup")?.addEventListener("click", () => hide("popup-overlay"));
function showPopup(msg, title = "Learnora") {
    $("popup-title").textContent = title;
    $("popup-message").textContent = msg;
    show("popup-overlay");
}

// Password toggle
document.querySelectorAll(".password-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
        const input = e.currentTarget.parentElement.querySelector("input");
        if (input.type === "password") {
            input.type = "text";
            e.currentTarget.textContent = "Hide";
        } else {
            input.type = "password";
            e.currentTarget.textContent = "Show";
        }
    });
});

// Password strength meter
const pwInput = $("new-password");
const strengthContainer = $("rp-strength-container");
const strengthText = $("rp-strength-text");

pwInput?.addEventListener("input", () => {
    const val = pwInput.value;
    if (!val) {
        strengthContainer?.classList.add("hidden");
        strengthContainer?.classList.remove("strength-weak", "strength-fair", "strength-good", "strength-strong");
        return;
    }
    strengthContainer?.classList.remove("hidden");
    strengthContainer?.classList.remove("strength-weak", "strength-fair", "strength-good", "strength-strong");

    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
    if (/\d/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    if (score <= 1 || val.length < 8) {
        strengthContainer?.classList.add("strength-weak");
        if (strengthText) strengthText.textContent = "Too Weak (Need 8+ chars & mix)";
    } else if (score === 2) {
        strengthContainer?.classList.add("strength-fair");
        if (strengthText) strengthText.textContent = "Fair";
    } else if (score === 3) {
        strengthContainer?.classList.add("strength-good");
        if (strengthText) strengthText.textContent = "Good";
    } else {
        strengthContainer?.classList.add("strength-strong");
        if (strengthText) strengthText.textContent = "Strong";
    }
});

// Loading/button state helper
function setLoading(isLoading) {
    const btn = $("reset-submit-btn");
    if (!btn) return;
    const text = btn.querySelector(".btn-text");
    const loader = btn.querySelector(".loader");
    btn.disabled = isLoading;
    text?.classList.toggle("hidden", isLoading);
    loader?.classList.toggle("hidden", !isLoading);
}

// =============================================
// MAIN LOGIC: Listen for auth state changes
// =============================================
let recoverySessionReady = false;
let authCheckTimeout = null;

function showRecoveryForm() {
    if (authCheckTimeout) {
        clearTimeout(authCheckTimeout);
        authCheckTimeout = null;
    }
    recoverySessionReady = true;
    hide("reset-loading-view");
    hide("reset-error-view");
    show("reset-form");
    if ($("reset-heading")) $("reset-heading").textContent = "Reset Password";
    if ($("reset-subtitle")) $("reset-subtitle").textContent = "Choose a strong, new password for your account.";
}

supabase.auth.onAuthStateChange((event, session) => {
    // Supabase fires PASSWORD_RECOVERY when the reset link token is valid
    if (event === "PASSWORD_RECOVERY" && session) {
        showRecoveryForm();
    }
});

// Check if session is already established on load (e.g. from URL token)
supabase.auth.getSession().then(({ data: { session } }) => {
    const url = window.location.href;
    if (session && (url.includes("type=recovery") || url.includes("#access_token"))) {
        showRecoveryForm();
    }
}).catch(() => {});

// If no PASSWORD_RECOVERY event fires within 5 seconds,
// the link is invalid/expired
authCheckTimeout = setTimeout(() => {
    if (!recoverySessionReady) {
        hide("reset-loading-view");
        show("reset-error-view");
        if ($("reset-heading")) $("reset-heading").textContent = "Link Expired";
        if ($("reset-subtitle")) $("reset-subtitle").textContent = "This reset link is no longer valid.";
    }
}, 5000);

// =============================================
// FORM SUBMISSION
// =============================================
$("reset-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const newPass = $("new-password").value;
    const confirmPass = $("confirm-password").value;

    // Validation
    if (!newPass || newPass.length < 8) {
        showPopup("Password must be at least 8 characters long.", "Weak Password");
        return;
    }
    if (newPass !== confirmPass) {
        showPopup("Passwords do not match. Please re-enter them.", "Password Mismatch");
        return;
    }

    setLoading(true);

    try {
        const { error } = await supabase.auth.updateUser({ password: newPass });

        if (error) {
            const msg = error?.message?.toLowerCase() || "";
            if (msg.includes("same") || msg.includes("different")) {
                showPopup("New password must be different from your current password.", "Same Password");
            } else {
                showPopup(error.message || "Failed to update password.", "Error");
            }
            setLoading(false);
            return;
        }

        // Invalidate all other sessions for security
        try {
            await supabase.auth.signOut({ scope: "others" });
        } catch {
            // Non-critical
        }

        // Sign out the current recovery session
        // The user should log in fresh with the new password
        try {
            await supabase.auth.signOut();
        } catch {
            // Non-critical
        }

        // Show success state
        hide("reset-form");
        show("reset-success-view");
        $("reset-heading").textContent = "All Done!";
        $("reset-subtitle").textContent = "You can now sign in with your new password.";

    } catch (err) {
        showPopup("Something went wrong. Please try again.", "Error");
        setLoading(false);
    }
});
