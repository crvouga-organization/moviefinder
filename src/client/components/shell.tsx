import type { ReactNode } from "react";
import {
  Anchor,
  AppShell,
  Button,
  Group,
  NavLink,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from "@mantine/core";
import { Link, useLocation } from "@tanstack/react-router";
import { Compass, Home, PlusSquare, UserRound, Users } from "lucide-react";
import { requestSignIn, useViewer } from "../state";
import { AccountAvatar } from "./account";
import { userAccount } from "../../shared/contracts";

const destinations = [
  { to: "/", label: "For You", icon: Home },
  { to: "/following", label: "Following", icon: Users },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/create", label: "Post", icon: PlusSquare },
  { to: "/me", label: "Profile", icon: UserRound },
] as const;
const activeFor = (pathname: string, to: string) =>
  to === "/" ? pathname === "/" : pathname.startsWith(to);

function Brand() {
  return (
    <Group gap="xs" wrap="nowrap">
      <ThemeIcon variant="filled" color="yellow" size="lg">
        <Text component="span" lh={1} aria-hidden="true">
          🍿
        </Text>
      </ThemeIcon>
      <Text fw={900} size="lg">
        MovieFinder
      </Text>
    </Group>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const me = useViewer();
  return (
    <AppShell
      navbar={{ width: 240, breakpoint: "md", collapsed: { mobile: true } }}
      footer={{ height: { base: 64, md: 0 } }}
      padding={0}
    >
      <Anchor
        href="#main-content"
        className="skip-link"
        pos="fixed"
        top="var(--mantine-spacing-sm)"
        left="var(--mantine-spacing-sm)"
        bg="dark.6"
        p="xs"
      >
        Skip to content
      </Anchor>
      <AppShell.Navbar p="md" aria-label="Main">
        <Stack gap="lg" h="100%">
          <UnstyledButton
            renderRoot={(props) => <Link {...props} to="/" />}
            aria-label="MovieFinder home"
          >
            <Brand />
          </UnstyledButton>
          <Stack gap={4}>
            {destinations.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                label={label}
                leftSection={
                  to === "/me" && me ? (
                    <AccountAvatar id={userAccount(me)} size="sm" />
                  ) : (
                    <Icon size={20} />
                  )
                }
                active={activeFor(pathname, to)}
                renderRoot={(props) => <Link {...props} to={to} />}
              />
            ))}
          </Stack>
          {!me && (
            <Button
              mt="auto"
              onClick={() => requestSignIn("Sign in to like, follow, comment and post.")}
            >
              Sign in
            </Button>
          )}
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main id="main-content" tabIndex={-1}>
        {children}
      </AppShell.Main>
      <AppShell.Footer hiddenFrom="md" component="nav" aria-label="Main">
        <Group h="100%" justify="space-around" wrap="nowrap" px="xs">
          {destinations.map(({ to, label, icon: Icon }) => {
            const active = activeFor(pathname, to);
            return (
              <UnstyledButton
                key={to}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                renderRoot={(props) => <Link {...props} to={to} />}
                c={active ? "yellow.4" : "gray.5"}
              >
                <Stack gap={2} align="center" w="3.75rem">
                  {to === "/me" && me ? (
                    <AccountAvatar id={userAccount(me)} size={24} />
                  ) : (
                    <Icon size={24} />
                  )}
                  <Text size="xs" fw={active ? 800 : 500} lineClamp={1}>
                    {label}
                  </Text>
                </Stack>
              </UnstyledButton>
            );
          })}
        </Group>
      </AppShell.Footer>
    </AppShell>
  );
}
