import { useEffect, Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
} from "@tanstack/react-router";
import { Anchor, Center, Stack, Text, Title } from "@mantine/core";
import { parseSearch, stringifySearch } from "../shared/search";
import { accountId, postId, topics, userAccount } from "../shared/contracts";
import { authClient } from "./auth-client";
import { rememberUser } from "./session";
import { report, startSync, useViewer } from "./state";
import { Shell } from "./components/shell";
import { SignInPrompt } from "./components/sign-in-prompt";
import { Toast } from "./components/toast";
import { AuthPage } from "./pages/auth";
import { HomePage } from "./pages/home";
import { ExplorePage } from "./pages/explore";
import { AccountPage } from "./pages/account";
import { PostPage } from "./pages/post";
import { WatchPage } from "./pages/watch";
import { CreatePage } from "./pages/create";
import { GoogleSignIn } from "./components/google";
import { beginNavigation, resolveNavigation, telemetryEnabled, track } from "./telemetry";

const commit: ProfilerOnRenderCallback = (id, phase, actual, base) => {
  if (actual >= 8)
    track("render", id, {
      phase,
      ms: Math.round(actual * 10) / 10,
      base: Math.round(base),
      path: location.pathname,
    });
};
function Profiled({ id, children }: { id: string; children: ReactNode }) {
  return telemetryEnabled ? (
    <Profiler id={id} onRender={commit}>
      {children}
    </Profiler>
  ) : (
    children
  );
}
// Every route is public. The session only decides whether interactions are available.
function Root() {
  const isAuth = useLocation({ select: (location) => location.pathname.startsWith("/auth") });
  const session = authClient.useSession();
  useEffect(() => {
    if (!session.isPending) rememberUser(session.data?.user.id);
  }, [session.isPending, session.data?.user.id]);
  useEffect(() => {
    void startSync().catch(report);
  }, []);
  if (isAuth)
    return (
      <>
        <Outlet />
        <Toast />
      </>
    );
  return (
    <>
      <Shell>
        <Profiled id="screen">
          <Outlet />
        </Profiled>
      </Shell>
      <SignInPrompt />
      <Toast />
    </>
  );
}
function NotFound() {
  return (
    <Center mih="60dvh" p="xl">
      <Stack align="center" gap="sm">
        <Title order={1}>Page not found</Title>
        <Text c="dimmed">This page doesn’t exist.</Text>
        <Anchor renderRoot={(props) => <Link {...props} to="/" />}>Back to For You</Anchor>
      </Stack>
    </Center>
  );
}
const topicIds: string[] = topics.map((t) => t.id);
const topicOf = (value: unknown) =>
  typeof value === "string" && topicIds.includes(value) ? value : "all";
const text = (value: unknown) => (typeof value === "string" ? value : undefined);

const root = createRootRoute({ component: Root, notFoundComponent: NotFound });
const home = createRoute({
  getParentRoute: () => root,
  path: "/",
  validateSearch: (search: Record<string, unknown>): { topic?: string } =>
    topicOf(search.topic) === "all" ? {} : { topic: topicOf(search.topic) },
  component: function Home() {
    const { topic } = home.useSearch();
    return <HomePage feed="foryou" topic={topic ?? "all"} />;
  },
});
const following = createRoute({
  getParentRoute: () => root,
  path: "/following",
  component: () => <HomePage feed="following" topic="all" />,
});
const explore = createRoute({
  getParentRoute: () => root,
  path: "/explore",
  validateSearch: (search: Record<string, unknown>): { q?: string; topic?: string } => ({
    ...(text(search.q)?.trim() ? { q: text(search.q)!.trim().slice(0, 200) } : {}),
    ...(topicOf(search.topic) !== "all" ? { topic: topicOf(search.topic) } : {}),
  }),
  component: function Explore() {
    const { q, topic } = explore.useSearch();
    return <ExplorePage q={q ?? ""} topic={topic ?? "all"} />;
  },
});
const account = createRoute({
  getParentRoute: () => root,
  path: "/account/$id",
  component: function Account() {
    const { id } = account.useParams();
    return accountId.safeParse(id).success ? <AccountPage key={id} id={id} /> : <NotFound />;
  },
});
const post = createRoute({
  getParentRoute: () => root,
  path: "/post/$id",
  component: function Post() {
    const { id } = post.useParams();
    return postId.safeParse(id).success ? <PostPage key={id} id={id} /> : <NotFound />;
  },
});
const watch = createRoute({
  getParentRoute: () => root,
  path: "/watch",
  validateSearch: (
    search: Record<string, unknown>,
  ): { account?: string; tab?: string; feed?: "explore"; topic?: string; start?: string } => ({
    ...(accountId.safeParse(search.account).success ? { account: String(search.account) } : {}),
    ...(text(search.tab) ? { tab: text(search.tab) } : {}),
    ...(search.feed === "explore" ? { feed: "explore" as const } : {}),
    ...(topicOf(search.topic) !== "all" ? { topic: topicOf(search.topic) } : {}),
    ...(postId.safeParse(search.start).success ? { start: String(search.start) } : {}),
  }),
  component: function Watch() {
    return <WatchPage {...watch.useSearch()} />;
  },
});
const create = createRoute({ getParentRoute: () => root, path: "/create", component: CreatePage });
const me = createRoute({
  getParentRoute: () => root,
  path: "/me",
  component: function Me() {
    const viewer = useViewer();
    const session = authClient.useSession();
    if (viewer) return <Navigate to="/account/$id" params={{ id: userAccount(viewer) }} replace />;
    if (session.isPending) return null;
    return (
      <Center mih="60dvh" p="xl">
        <Stack gap="md" maw="24rem">
          <Title order={1}>Your profile</Title>
          <Text c="dimmed">Sign in to set up your profile, follow accounts and post.</Text>
          <GoogleSignIn returnTo="/me" />
        </Stack>
      </Center>
    );
  },
});
const auth = createRoute({ getParentRoute: () => root, path: "/auth", component: AuthPage });

export const router = createRouter({
  parseSearch,
  stringifySearch,
  routeTree: root.addChildren([home, following, explore, account, post, watch, create, me, auth]),
  scrollRestoration: true,
  defaultPreload: false,
  defaultPendingMs: 0,
  defaultPendingMinMs: 0,
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
if (telemetryEnabled) {
  router.subscribe("onBeforeNavigate", (e) => beginNavigation(e.toLocation.href));
  router.subscribe("onResolved", (e) => resolveNavigation(e.toLocation.href));
}
export function App() {
  return <RouterProvider router={router} />;
}
