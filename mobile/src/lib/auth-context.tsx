// ── Auth Context ──────────────────────────────────────────────
// Provides authenticated user, org, and agent data to the entire app.
// Listens to Supabase auth state changes and auto-fetches profile.

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { API_URL, getAuthHeaders, fetchAgentProfile } from "./api";
import { setupPushNotifications, removePushTokenFromServer } from "./push-notifications";
import { clearQueryCache } from "./query-persistence";
import { clearAllCache } from "./offline-cache";
import type { AuthState, User, Organization, BrokerAgent } from "@/types";
import type { Session } from "@supabase/supabase-js";

const AuthContext = createContext<
  AuthState & {
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    refresh: () => Promise<void>;
  }
>({
  user: null,
  org: null,
  agent: null,
  isLoading: true,
  isAuthenticated: false,
  signIn: async () => {},
  signOut: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [agent, setAgent] = useState<BrokerAgent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user profile + org + agent record from the backend API.
  // Uses the already-deployed /api/mobile/agent/profile endpoint.
  // Response shape varies:
  //   - Agent users: { id, user: { id, email, fullName, ... }, organization: { id, name, ... }, ... }
  //   - Non-agent users: { id, email, fullName, role, organization: { id, name, ... } }
  async function loadProfile(_session: Session) {
    try {
      const headers = await getAuthHeaders();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);

      const res = await fetch(`${API_URL}/api/mobile/agent/profile`, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();

        // Agent response has nested `user` and `organization` fields
        if (data.user && data.organization) {
          // Agent shape — extract user info from nested user object
          const u = data.user;
          setUser({
            id: u.id,
            email: u.email,
            fullName: u.fullName,
            role: u.role ?? "agent",
            plan: u.plan ?? "free",
            title: u.title ?? null,
            phone: u.phone ?? null,
            avatarUrl: u.avatarUrl ?? null,
            orgId: data.organization.id ?? data.orgId,
            isApproved: true,
            isActive: true,
          } as User);
          setOrg(data.organization as Organization);
          setAgent(data as BrokerAgent);
        } else if (data.organization) {
          // Non-agent shape — data IS the user, with nested organization
          setUser({
            id: data.id,
            email: data.email,
            fullName: data.fullName,
            role: data.role ?? "admin",
            plan: data.plan ?? "free",
            title: data.title ?? null,
            phone: data.phone ?? null,
            avatarUrl: data.avatarUrl ?? null,
            orgId: data.organization.id,
            isApproved: true,
            isActive: true,
          } as User);
          setOrg(data.organization as Organization);
          setAgent(null);
        } else {
          console.warn("[AUTH] Unexpected profile response shape:", Object.keys(data));
        }

        // Register for push notifications (fire-and-forget)
        setupPushNotifications().catch(() => {});
      } else {
        console.warn("[AUTH] /api/mobile/agent/profile returned", res.status);
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // Safety net: if auth takes more than 10 seconds, stop loading
    // so the app doesn't hang on splash forever
    const authTimeout = setTimeout(() => {
      setIsLoading((current) => {
        if (current) {
          console.warn("[AUTH] Auth timeout after 10s — showing login");
        }
        return false;
      });
    }, 10_000);

    // Check for existing session on app launch
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        loadProfile(session);
      } else {
        setIsLoading(false);
      }
    }).catch(() => {
      // If Supabase itself fails (bad URL, network error), don't hang
      setIsLoading(false);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadProfile(session);
      } else {
        setUser(null);
        setOrg(null);
        setAgent(null);
        setIsLoading(false);
      }
    });

    return () => {
      clearTimeout(authTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setIsLoading(false);
      throw error;
    }
    // onAuthStateChange will handle the rest
  };

  const signOut = async () => {
    // Clean up push token on server before losing auth
    await removePushTokenFromServer();
    // Sign out of Supabase (clears session)
    await supabase.auth.signOut();
    // Clear local state
    setUser(null);
    setOrg(null);
    setAgent(null);
    // Clear cached data (fire-and-forget, don't block logout)
    clearQueryCache().catch(() => {});
    clearAllCache().catch(() => {});
  };

  const refresh = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) await loadProfile(session);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        org,
        agent,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signOut,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
