import { create } from "zustand";
import type { Role, User } from "@/types";
import { DEFAULT_PASSENGER } from "@/data/mock/users";
import { DEFAULT_RIDER } from "@/data/mock/riders";

/**
 * Who is using the app.
 *
 * There is no authentication service, so "signing in" is choosing a role on
 * the front door. Each role gets a fixed demo account from `data/mock` — the
 * shape of the state is what a real session would carry.
 */

interface SessionState {
  role: Role | null;
  user: User | null;
  selectRole: (role: Role) => void;
  signOut: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  role: null,
  user: null,
  selectRole: (role) =>
    set({
      role,
      user: role === "passenger" ? DEFAULT_PASSENGER : DEFAULT_RIDER,
    }),
  signOut: () => set({ role: null, user: null }),
}));

export const useCurrentPassenger = (): { id: string; name: string } => {
  const user = useSessionStore((state) => state.user);
  return user && user.role === "passenger"
    ? { id: user.id, name: user.name }
    : { id: DEFAULT_PASSENGER.id, name: DEFAULT_PASSENGER.name };
};
