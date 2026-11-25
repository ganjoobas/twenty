// core.user.email is citext and lowercased on insert; normalising here keeps logs and comparisons consistent
export const normalizeBridgeEmail = (email: string) => email.trim().toLowerCase();
