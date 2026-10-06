/** Sub-path the site is served from (GitHub Pages project sites live under /<repo>). Empty in dev. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Static deployment reads the build-time snapshot; dev reads the live API. */
export const DATA_URL = process.env.NEXT_PUBLIC_STATIC === "1" ? `${BASE_PATH}/parking.json` : "/api/parking";
