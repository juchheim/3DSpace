export type DevIdentity = {
  userId: string;
  displayName: string;
  role: "teacher" | "student";
};

export type ApiIdentity = DevIdentity & {
  getAuthToken?: () => Promise<string | null>;
};

export const DEFAULT_IDENTITY: DevIdentity = {
  userId: "dev-teacher",
  displayName: "Ms. Rivera",
  role: "teacher"
};

export function identityHeaders(identity: DevIdentity) {
  return {
    "x-dev-user-id": identity.userId,
    "x-dev-user-name": identity.displayName,
    "x-dev-user-role": identity.role
  };
}

export function identityForRole(role: "teacher" | "student"): DevIdentity {
  if (role === "teacher") {
    return DEFAULT_IDENTITY;
  }

  return {
    userId: "dev-student",
    displayName: "Avery Student",
    role: "student"
  };
}
