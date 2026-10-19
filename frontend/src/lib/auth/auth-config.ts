// Central place for auth routes. Change the post-login destination here only;
// forms and guards must import it instead of hard-coding a path.

export const LOGIN_PATH = "/login";
export const REGISTER_PATH = "/register";

/** Where a successful login or registration sends the user (later /dashboard). */
export const AUTH_REDIRECT_PATH = "/";
