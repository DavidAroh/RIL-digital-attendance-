import { useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import { AuthContext, type AuthContextType, type SignUpUserData } from "./AuthContext";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Supabase error fetching profile:", error);
        return null;
      }
      if (data) {
        // Normalize legacy role names if present
        let normalizedRole = data.role;
        if (data.role === 'student' as unknown) normalizedRole = 'employee';
        if (data.role === 'lecturer' as unknown) normalizedRole = 'manager';

        return {
          ...data,
          role: normalizedRole,
          employee_id: data.employee_id || data.matric_number,
          matric_number: data.employee_id || data.matric_number,
          designation: data.designation || data.level,
          level: data.designation || data.level,
        };
      }
      return data;
    } catch (e) {
      console.error("Error fetching profile:", e);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  };

  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [recoveryTokens, setRecoveryTokens] = useState<{
    access_token: string;
    refresh_token: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      let code = url.searchParams.get("code");
      let access_token: string | null = null;
      let refresh_token: string | null = null;
      let token_hash: string | null = url.searchParams.get("token_hash");
      let token: string | null = url.searchParams.get("token");
      let emailParam: string | null = url.searchParams.get("email");
      if (!code && typeof window !== "undefined") {
        const raw = window.location.hash || "";
        const content = raw.startsWith("#") ? raw.slice(1) : raw;
        const parts = content.split("#");
        const candidate = content.includes("?")
          ? content.split("?")[1]
          : parts[parts.length - 1] || "";
        if (candidate) {
          const params = new URLSearchParams(candidate);
          code = params.get("code");
          access_token = params.get("access_token");
          refresh_token = params.get("refresh_token");
          token_hash = token_hash || params.get("token_hash");
          token = token || params.get("token");
          emailParam = emailParam || params.get("email");
        }
      }
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code);
          try {
            await supabase.auth.refreshSession();
          } catch {
            void 0;
          }
          setPasswordRecovery(true);
          if (url.searchParams.has("code")) {
            url.searchParams.delete("code");
            window.history.replaceState({}, "", url.toString());
          } else if (typeof window !== "undefined") {
            const rawHash = window.location.hash || "";
            const base = rawHash ? rawHash.slice(1).split("#")[0] : "";
            const anchor = base ? `#${base}` : "";
            const clean =
              window.location.origin + window.location.pathname + anchor;
            window.history.replaceState({}, "", clean);
          }
        } catch {
          void 0;
        }
      } else if (access_token && refresh_token) {
        try {
          await supabase.auth.setSession({ access_token, refresh_token });
          try {
            await supabase.auth.refreshSession();
          } catch {
            void 0;
          }
          if (typeof window !== "undefined") {
            const rawHash = window.location.hash || "";
            const base = rawHash ? rawHash.slice(1).split("#")[0] : "";
            const anchor = base ? `#${base}` : "";
            const clean =
              window.location.origin + window.location.pathname + anchor;
            window.history.replaceState({}, "", clean);
          }
          setPasswordRecovery(true);
          setRecoveryTokens({ access_token, refresh_token });
          try {
            localStorage.setItem(
              "recovery_tokens",
              JSON.stringify({ access_token, refresh_token }),
            );
          } catch {
            void 0;
          }
        } catch {
          void 0;
        }
      } else if (token_hash || (token && emailParam)) {
        try {
          if (token_hash) {
            await supabase.auth.verifyOtp({ type: "recovery", token_hash });
          } else if (token && emailParam) {
            await supabase.auth.verifyOtp({
              type: "recovery",
              token,
              email: emailParam,
            });
          }
          try {
            await supabase.auth.refreshSession();
          } catch {
            void 0;
          }
          if (typeof window !== "undefined") {
            const rawHash = window.location.hash || "";
            const base = rawHash ? rawHash.slice(1).split("#")[0] : "";
            const anchor = base ? `#${base}` : "";
            const clean =
              window.location.origin + window.location.pathname + anchor;
            window.history.replaceState({}, "", clean);
          }
          setPasswordRecovery(true);
        } catch {
          void 0;
        }
      }
    })();
    supabase.auth.getSession().then(({ data: { session } }) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        const isResetRoute =
          typeof window !== "undefined" &&
          (window.location.pathname === "/reset" ||
            (window.location.hash || "").startsWith("#reset"));
        setPasswordRecovery(isResetRoute ? true : false);
        if (session?.user) {
          const profileData = await fetchProfile(session.user.id);
          setProfile(profileData);
          let sigB64: string | null = null;
          try {
            sigB64 = localStorage.getItem(
              `pending_signature_${session.user.id}`,
            );
          } catch {
            sigB64 = null;
          }
          if (sigB64 && (!profileData || !profileData.signature_url)) {
            try {
              const match = sigB64.match(/^data:(.*?);base64,(.*)$/);
              if (match) {
                const mime = match[1];
                const b64 = match[2];
                const binary = atob(b64);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++)
                  array[i] = binary.charCodeAt(i);
                const blob = new Blob([array], { type: mime });
                const ext = mime.includes("png")
                  ? "png"
                  : mime.includes("jpeg")
                    ? "jpg"
                    : "webp";
                const path = `signatures/${session.user.id}-${Date.now()}.${ext}`;
                const uploadRes = await supabase.storage
                  .from("signatures")
                  .upload(path, blob, { contentType: mime, upsert: true });
                if (!uploadRes.error) {
                  const { data: pub } = supabase.storage
                    .from("signatures")
                    .getPublicUrl(path);
                  await supabase
                    .from("profiles")
                    .update({ signature_url: pub.publicUrl })
                    .eq("id", session.user.id);
                  try {
                    localStorage.removeItem(
                      `pending_signature_${session.user.id}`,
                    );
                  } catch {
                    void 0;
                  }
                  const refreshed = await fetchProfile(session.user.id);
                  setProfile(refreshed);
                }
              }
            } catch {
              void 0;
            }
          }
        }
        setLoading(false);
      })();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        const isResetRoute =
          typeof window !== "undefined" &&
          (window.location.pathname === "/reset" ||
            (window.location.hash || "").startsWith("#reset"));
        setPasswordRecovery(
          event === "PASSWORD_RECOVERY" ||
            (event === "SIGNED_IN" && isResetRoute),
        );
        if (session?.user) {
          let profileData = await fetchProfile(session.user.id);

          // If profile not found immediately, wait a moment and retry (trigger might be creating it)
          if (!profileData) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            profileData = await fetchProfile(session.user.id);
          }

          setProfile(profileData);
          let sigB64: string | null = null;
          try {
            sigB64 = localStorage.getItem(
              `pending_signature_${session.user.id}`,
            );
          } catch {
            sigB64 = null;
          }
          if (sigB64 && (!profileData || !profileData.signature_url)) {
            try {
              const match = sigB64.match(/^data:(.*?);base64,(.*)$/);
              if (match) {
                const mime = match[1];
                const b64 = match[2];
                const binary = atob(b64);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++)
                  array[i] = binary.charCodeAt(i);
                const blob = new Blob([array], { type: mime });
                const ext = mime.includes("png")
                  ? "png"
                  : mime.includes("jpeg")
                    ? "jpg"
                    : "webp";
                const path = `signatures/${session.user.id}-${Date.now()}.${ext}`;
                const uploadRes = await supabase.storage
                  .from("signatures")
                  .upload(path, blob, { contentType: mime, upsert: true });
                if (!uploadRes.error) {
                  const { data: pub } = supabase.storage
                    .from("signatures")
                    .getPublicUrl(path);
                  await supabase
                    .from("profiles")
                    .update({ signature_url: pub.publicUrl })
                    .eq("id", session.user.id);
                  try {
                    localStorage.removeItem(
                      `pending_signature_${session.user.id}`,
                    );
                  } catch {
                    void 0;
                  }
                  const refreshed = await fetchProfile(session.user.id);
                  setProfile(refreshed);
                }
              }
            } catch {
              void 0;
            }
          }
        } else {
          setProfile(null);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (err) {
      const msg = String((err as { message?: string })?.message || err);
      if (/Failed to fetch/i.test(msg)) {
        throw new Error(
          "Network error: Check internet connection and Supabase URL/key configuration",
        );
      }
      throw err instanceof Error ? err : new Error("Sign in failed");
    }
  };

  const signUp = async (
    email: string,
    password: string,
    userData: SignUpUserData,
    signatureFile?: File | null,
  ) => {
    // Convert signature file to base64 for storage
    let signatureBase64: string | null = null;
    if (signatureFile) {
      signatureBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(signatureFile);
      }).catch(() => null);
    }

    const employeeId = userData.employee_id || userData.matric_number || null;
    const designation = userData.designation || userData.level || null;

    // Sign up user (database trigger will create profile)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: userData.full_name,
          role: userData.role,
          employee_id: employeeId,
          matric_number: employeeId,
          department: userData.department || null,
          designation: designation,
          level: designation,
        },
      },
    });

    if (error) throw error;
    if (!data.user) throw new Error("User creation failed");

    // Store signature for later upload by the authStateChange listener
    if (signatureBase64) {
      try {
        localStorage.setItem(
          `pending_signature_${data.user.id}`,
          signatureBase64,
        );
      } catch {
        void 0;
      }
    }
  };

  const signOut = async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      } else {
        try {
          await supabase.auth.signOut();
        } catch (e) {
          const msg = String((e as { message?: string })?.message || e);
          if (!/Auth session missing/i.test(msg)) {
            throw e instanceof Error ? e : new Error("Sign out failed");
          }
        }
      }
    } finally {
      setSession(null);
      setUser(null);
      setProfile(null);
      setPasswordRecovery(false);
      try {
        localStorage.removeItem("recovery_tokens");
      } catch {
        void 0;
      }
    }
  };

  const requestForgotPassword = async (email: string) => {
    const redirect = `${window.location.origin}/#reset`;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirect,
      });
      if (error) throw error;
      try {
        localStorage.setItem("last_reset_email", email.trim());
      } catch {
        void 0;
      }
      return;
    } catch {
      try {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirect },
        });
        if (otpError) throw otpError;
        try {
          localStorage.setItem("last_reset_email", email.trim());
        } catch {
          void 0;
        }
        return;
      } catch (fallbackErr) {
        const msg = String(
          (fallbackErr as { message?: string })?.message || fallbackErr,
        );
        if (/Failed to fetch/i.test(msg)) {
          throw new Error(
            "Network error: Check internet connection and Supabase URL/key configuration",
          );
        }
        throw fallbackErr instanceof Error
          ? fallbackErr
          : new Error("Failed to send reset email");
      }
    }
  };

  const completePasswordReset = async (newPassword: string) => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session && recoveryTokens) {
        try {
          await supabase.auth.setSession({
            access_token: recoveryTokens.access_token,
            refresh_token: recoveryTokens.refresh_token,
          });
        } catch {
          void 0;
        }
      }
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      if (data.user) {
        setPasswordRecovery(false);
        setRecoveryTokens(null);
        try {
          localStorage.removeItem("recovery_tokens");
        } catch {
          void 0;
        }
      }
    } catch (err) {
      const msg = String((err as { message?: string })?.message || err);
      if (/Failed to fetch/i.test(msg)) {
        throw new Error(
          "Network error: Check internet connection and Supabase URL/key configuration",
        );
      }
      const text = /Auth session missing/i.test(msg)
        ? "Recovery session missing. Reopen the reset link from your email."
        : "Password update failed";
      throw err instanceof Error ? new Error(text) : new Error(text);
    }
  };

  const ensureRecoverySession = async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (sess.session) return;
    const url = new URL(window.location.href);
    let code = url.searchParams.get("code");
    let access_token: string | null = null;
    let refresh_token: string | null = null;
    let token_hash: string | null = url.searchParams.get("token_hash");
    let token: string | null = url.searchParams.get("token");
    let emailParam: string | null = url.searchParams.get("email");
    const raw = window.location.hash || "";
    const content = raw.startsWith("#") ? raw.slice(1) : raw;
    const parts = content.split("#");
    const candidate = content.includes("?")
      ? content.split("?")[1]
      : parts[parts.length - 1] || "";
    if (!code && candidate) {
      const params = new URLSearchParams(candidate);
      code = params.get("code");
      access_token = params.get("access_token");
      refresh_token = params.get("refresh_token");
      token_hash = token_hash || params.get("token_hash");
      token = token || params.get("token");
      emailParam = emailParam || params.get("email");
    }
    if (!access_token || !refresh_token) {
      try {
        const cached = localStorage.getItem("recovery_tokens");
        if (cached) {
          const parsed = JSON.parse(cached) as {
            access_token: string;
            refresh_token: string;
          };
          access_token = parsed.access_token;
          refresh_token = parsed.refresh_token;
        }
      } catch {
        void 0;
      }
    }
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const verify = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        try {
          await supabase.auth.refreshSession();
        } catch {
          void 0;
        }
      }
      return (await supabase.auth.getSession()).data.session;
    };
    if (code) {
      try {
        await supabase.auth.exchangeCodeForSession(code);
      } catch {
        void 0;
      }
      await wait(150);
    } else if (access_token && refresh_token) {
      try {
        await supabase.auth.setSession({ access_token, refresh_token });
      } catch {
        void 0;
      }
      await wait(150);
    } else if (token_hash || (token && emailParam)) {
      try {
        if (token_hash) {
          await supabase.auth.verifyOtp({ type: "recovery", token_hash });
        } else if (token && emailParam) {
          await supabase.auth.verifyOtp({
            type: "recovery",
            token,
            email: emailParam,
          });
        }
      } catch {
        void 0;
      }
      await wait(150);
    } else if (recoveryTokens) {
      try {
        await supabase.auth.setSession({
          access_token: recoveryTokens.access_token,
          refresh_token: recoveryTokens.refresh_token,
        });
      } catch {
        void 0;
      }
      await wait(150);
    }
    const ok = await verify();
    if (!ok && access_token && refresh_token) {
      try {
        await supabase.auth.setSession({ access_token, refresh_token });
      } catch {
        void 0;
      }
      await wait(150);
      await verify();
    }
    try {
      setPasswordRecovery(true);
    } catch {
      void 0;
    }
  };

  const value: AuthContextType = {
    user,
    profile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    requestForgotPassword,
    completePasswordReset,
    passwordRecovery,
    ensureRecoverySession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
