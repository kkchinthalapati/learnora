/* The brand image, at the same URL index.html's favicon and apple-touch-icon
 * point at (public/learnora.jpg). Components used to import a copy from
 * src/assets, which Vite serves under a second, hashed URL — so every first
 * load downloaded the same 62 KB picture twice. `BASE_URL` keeps it working
 * under the `/app/` prefix, which is why the import existed. */
export const LOGO_URL = `${import.meta.env.BASE_URL}learnora.jpg`;
