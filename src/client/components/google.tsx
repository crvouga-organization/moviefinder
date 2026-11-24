import { useEffect, useState } from "react";
import { Alert, Button, Image, Stack, Text, UnstyledButton } from "@mantine/core";
import { authClient } from "../auth-client";
import { safeReturnTo } from "../../shared/contracts";

// Google's approved sign-in bitmap, unmodified, plus availability and failure feedback.
export function GoogleSignIn({
  returnTo,
  initialError,
}: {
  returnTo: string;
  initialError?: string;
}) {
  const [availability, setAvailability] = useState<"checking" | "ready" | "unavailable">(
    "checking",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialError ?? "");
  async function checkAvailability(signal?: AbortSignal) {
    setAvailability("checking");
    try {
      const response = await fetch("/api/auth-options", { signal });
      if (!response.ok) throw new Error("Unavailable");
      const options = await response.json();
      setAvailability(options.google === true ? "ready" : "unavailable");
    } catch {
      if (!signal?.aborted) setAvailability("unavailable");
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void checkAvailability(controller.signal);
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", restore);
    return () => {
      controller.abort();
      window.removeEventListener("pageshow", restore);
    };
  }, []);
  async function signIn() {
    setBusy(true);
    setMessage("");
    try {
      const target = safeReturnTo(returnTo);
      const errorURL = new URL("/auth", window.location.origin);
      errorURL.searchParams.set("socialError", "1");
      errorURL.searchParams.set("returnTo", target);
      const result = await authClient.signIn.social({
        provider: "auth-relay",
        callbackURL: target,
        errorCallbackURL: errorURL.href,
      });
      if (result.error) throw new Error("Unavailable");
    } catch {
      setMessage("Google sign-in is unavailable right now. Please try again.");
      setBusy(false);
    }
  }
  return (
    <Stack gap="sm" align="flex-start">
      <UnstyledButton
        type="button"
        aria-label="Sign in with Google"
        disabled={availability !== "ready" || busy}
        onClick={() => void signIn()}
      >
        <Image src="/brand/google-signin-light.png" w={216} h={48} alt="" />
      </UnstyledButton>
      <Stack role="status" aria-live="polite" gap="xs" mih="5rem" w="100%">
        {availability === "unavailable" ? (
          <>
            <Alert color="red">Sign-in is temporarily unavailable.</Alert>
            <Button variant="default" onClick={() => void checkAvailability()}>
              Try again
            </Button>
          </>
        ) : message ? (
          <Alert color="red">{message}</Alert>
        ) : busy ? (
          <Text c="dimmed">Opening Google…</Text>
        ) : availability === "checking" ? (
          <Text c="dimmed">Checking sign-in availability…</Text>
        ) : (
          <Text size="sm" c="dimmed">
            An account is created on your first sign-in.
          </Text>
        )}
      </Stack>
    </Stack>
  );
}
