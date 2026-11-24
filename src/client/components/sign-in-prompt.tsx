import { useEffect, useState } from "react";
import { Modal, Stack, Text } from "@mantine/core";
import { useLocation } from "@tanstack/react-router";
import { notices } from "../notifications";
import { GoogleSignIn } from "./google";

// Visitors browse everything; liking, following, commenting and posting open this prompt.
export function SignInPrompt() {
  const [reason, setReason] = useState<string>();
  const href = useLocation({ select: (location) => location.href });
  useEffect(() => {
    const open = (event: Event) => setReason((event as CustomEvent<string>).detail);
    notices.addEventListener("sign-in", open);
    return () => notices.removeEventListener("sign-in", open);
  }, []);
  return (
    <Modal opened={!!reason} onClose={() => setReason(undefined)} title="Sign in to MovieFinder">
      <Stack gap="md">
        <Text>{reason}</Text>
        {reason && <GoogleSignIn returnTo={href} />}
      </Stack>
    </Modal>
  );
}
