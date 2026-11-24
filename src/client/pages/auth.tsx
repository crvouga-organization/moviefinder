import { useLocation } from "@tanstack/react-router";
import {
  Center,
  Container,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { GoogleSignIn } from "../components/google";

export function AuthPage() {
  const params = new URLSearchParams(useLocation({ select: (l) => l.searchStr }));
  return (
    <Center component="main" mih="100dvh" p="md">
      <Container size="xs" w="100%" px={0}>
        <Stack gap="xl">
          <Group justify="center" gap="sm">
            <ThemeIcon variant="filled" size="xl" color="yellow" radius="xl">
              <Text component="span" size="xl" lh={1} aria-hidden="true">
                🍿
              </Text>
            </ThemeIcon>
            <Text fw={900} size="xl">
              MovieFinder
            </Text>
          </Group>
          <Paper withBorder p={{ base: "lg", xs: "xl" }} radius="lg" shadow="lg">
            <Stack align="flex-start" gap="lg">
              <Title order={1} id="auth-title">
                Sign in
              </Title>
              <Text c="dimmed">
                Sign in to like posts, follow movies, shows, people and members, comment and post.
              </Text>
              <Divider w="100%" variant="dashed" color="violet.5" />
              <GoogleSignIn
                returnTo={params.get("returnTo") ?? "/"}
                initialError={
                  params.has("socialError")
                    ? "We couldn’t complete your sign-in. Please try again."
                    : undefined
                }
              />
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Center>
  );
}
