/** Organization-scoped URL helper. Plain module (no "use client") so server and client code can both import it. */
export const orgPath = (slug: string, path = "") => `/o/${slug}${path}`;
