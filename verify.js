// Smoothly redirects back to the main app while carrying the secure Supabase
// tokens in the URL hash (the Supabase client on index.html consumes them).
setTimeout(() => {
    window.location.replace("index.html" + window.location.hash);
}, 3000);
