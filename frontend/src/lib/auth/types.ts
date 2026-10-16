// Hand-written on purpose: Swagger declares no response schema for /auth/*.
// Shape verified from live responses (develop 11158814). Replace with
// generated types once the backend documents these responses.

export type SessionUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  status: string;
  emailVerified: boolean;
  lastLogin: string | null;
  createdAt: string;
};

// What the browser receives from the BFF. The refresh token is never part of
// this: it only ever lives in the HttpOnly cookie.
export type Session = {
  accessToken: string;
  user: SessionUser;
};
