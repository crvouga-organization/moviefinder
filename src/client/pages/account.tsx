import { useState } from "react";
import {
  ActionIcon,
  Alert,
  AspectRatio,
  Badge,
  Box,
  Button,
  Container,
  Drawer,
  Group,
  SimpleGrid,
  Skeleton,
  ScrollArea,
  Spoiler,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, LogOut } from "lucide-react";
import {
  accountKind,
  audienceOf,
  fieldText,
  userAccount,
  type Entity,
} from "../../shared/contracts";
import { AccountAvatar, AccountRow, FollowButton, accountHandle } from "../components/account";
import { Image } from "../components/image";
import { PostTile } from "../components/post";
import { entityImages } from "../images";
import {
  accountKey,
  authClient,
  loadAccount,
  report,
  send,
  useAudience,
  useEntities,
  useEntity,
  useLoad,
  useView,
  useViewer,
} from "../state";

const compact = new Intl.NumberFormat("en", { notation: "compact" });
const tabLabels: Record<string, string> = {
  posts: "Posts",
  videos: "Videos",
  community: "Community",
  cast: "Cast",
  related: "Related",
  credits: "Credits",
  likes: "Likes",
};
const tabsFor = (id: string) => {
  const kind = accountKind(id);
  return kind === "user"
    ? ["posts", "likes"]
    : kind === "person"
      ? ["posts", "credits", "community"]
      : ["posts", "videos", "community", "cast", "related"];
};

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <Stack gap={0} align="center" w="5rem">
      <Text fw={800} ff="monospace">
        {value === undefined ? "–" : compact.format(value)}
      </Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Stack>
  );
}
function Facts({ account }: { account: Entity | undefined }) {
  const genres = useEntities("genre", account?.genres ?? []);
  if (account && accountKind(account.id) === "user") return null;
  const runtime = Array.isArray(account?.data.runtime)
    ? Number(account.data.runtime[0])
    : Number(account?.data.runtime);
  const facts = [
    account?.year,
    runtime ? `${runtime} min` : undefined,
    account?.data.numberOfSeasons
      ? `${fieldText(account.data.numberOfSeasons)} seasons`
      : undefined,
    account?.rating ? `★ ${account.rating.toFixed(1)}` : undefined,
    fieldText(account?.data.birthplace) || undefined,
  ].filter(Boolean);
  // One reserved row; late facts and genres scroll sideways instead of pushing content down.
  return (
    <ScrollArea h="2.75rem" scrollbars="x" offsetScrollbars="x">
      <Group gap="xs" wrap="nowrap">
        {facts.map((fact) => (
          <Badge key={String(fact)} variant="light" color="gray">
            {fact}
          </Badge>
        ))}
        {genres.map((g) => (
          <Badge key={g.id} variant="light" color="violet">
            {g.title}
          </Badge>
        ))}
      </Group>
    </ScrollArea>
  );
}
function ProfileEditor({ account, onClose }: { account: Entity; onClose: () => void }) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLDivElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as unknown as HTMLFormElement);
    setBusy(true);
    setError(undefined);
    try {
      await send({
        type: "profile",
        name: fieldText(form.get("name")),
        username: fieldText(form.get("username")),
        bio: fieldText(form.get("bio")),
        image: fieldText(form.get("image")),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your profile couldn’t be saved");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack component="form" onSubmit={submit} gap="md">
      <TextInput name="name" label="Name" required maxLength={100} defaultValue={account.title} />
      <TextInput
        name="username"
        label="Username"
        required
        pattern="[a-zA-Z0-9_]{3,30}"
        description="3–30 letters, numbers or underscores"
        defaultValue={fieldText(account.data.username)}
      />
      <Textarea
        name="bio"
        label="Bio"
        maxLength={500}
        autosize
        minRows={3}
        defaultValue={fieldText(account.data.bio)}
      />
      <TextInput
        name="image"
        label="Photo URL"
        type="url"
        description="An HTTPS image address"
        defaultValue={fieldText(account.data.image)}
      />
      {error && <Alert color="red">{error}</Alert>}
      <Button type="submit" disabled={busy}>
        Save profile
      </Button>
    </Stack>
  );
}
function Header({ id }: { id: string }) {
  const account = useEntity(id);
  const audience = useAudience(id);
  const view = useView(accountKey(id));
  const me = useViewer();
  const own = !!me && userAccount(me) === id;
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const counts = audienceOf(audience);
  const kind = accountKind(id);
  const posts = kind === "user" ? (audience ? counts.posts : undefined) : view?.views.posts?.length;
  return (
    <Stack gap="md" component="header">
      <Box pos="relative" h={{ base: "8rem", sm: "12rem" }} bg="dark.6">
        {account?.backdrop && (
          <Image
            images={entityImages(account).filter((i) => i.role === "backdrop")}
            slot="backdrop"
            radius={0}
          />
        )}
        <ActionIcon
          pos="absolute"
          top="var(--mantine-spacing-sm)"
          left="var(--mantine-spacing-sm)"
          variant="filled"
          color="dark"
          aria-label="Back"
          onClick={() => router.history.back()}
        >
          <ArrowLeft size={20} />
        </ActionIcon>
      </Box>
      <Group align="flex-end" gap="md" mt="-3.5rem" px="md" wrap="nowrap">
        <AccountAvatar id={id} size={96} />
        <Group gap="xs" ml="auto">
          {own ? (
            <>
              <Button variant="default" onClick={() => setEditing(true)} disabled={!account}>
                Edit profile
              </Button>
              <ActionIcon
                aria-label="Sign out"
                variant="default"
                onClick={() =>
                  void authClient.signOut().then(() => window.location.assign("/"), report)
                }
              >
                <LogOut size={18} />
              </ActionIcon>
            </>
          ) : (
            <FollowButton id={id} size="md" />
          )}
        </Group>
      </Group>
      <Stack gap={4} px="md">
        <Title order={1} lineClamp={1} title={account?.title}>
          {account?.title ?? "\u00a0"}
        </Title>
        <Text c="dimmed" lineClamp={1}>
          {account ? accountHandle(account, id) : "\u00a0"}
        </Text>
      </Stack>
      <Group gap="xs" px="md">
        <Stat value={posts} label="Posts" />
        <Stat value={audience ? counts.followers : undefined} label="Followers" />
        {kind === "user" && (
          <Stat value={audience ? counts.following : undefined} label="Following" />
        )}
      </Group>
      <Stack gap="xs" px="md">
        <Facts account={account} />
        {/* Reserves the collapsed overview and its "more" control before the text arrives. */}
        <Box mih="6.25rem">
          {account?.overview ? (
            <Spoiler maxHeight={66} showLabel="more" hideLabel="less">
              <Text size="sm">{account.overview}</Text>
            </Spoiler>
          ) : (
            !account && <Skeleton h="3rem" />
          )}
        </Box>
      </Stack>
      {own && account && (
        <Drawer opened={editing} onClose={() => setEditing(false)} title="Edit profile">
          <ProfileEditor account={account} onClose={() => setEditing(false)} />
        </Drawer>
      )}
    </Stack>
  );
}
function PostGrid({ id, tab, ids }: { id: string; tab: string; ids: string[] }) {
  return (
    <SimpleGrid cols={3} spacing={2} verticalSpacing={2}>
      {ids.map((post) => (
        <PostTile key={post} id={post}>
          {(inner) => (
            <UnstyledButton
              aria-label="Open post"
              renderRoot={(props) => (
                <Link {...props} to="/watch" search={{ account: id, tab, start: post }} />
              )}
            >
              {inner}
            </UnstyledButton>
          )}
        </PostTile>
      ))}
    </SimpleGrid>
  );
}
function TitleTile({ id }: { id: string }) {
  const title = useEntity(id);
  return (
    <UnstyledButton
      aria-label={title?.title ?? "Open title"}
      renderRoot={(props) => <Link {...props} to="/account/$id" params={{ id }} />}
    >
      <Stack gap={4}>
        <AspectRatio ratio={2 / 3}>
          <Box bg="dark.6">
            <Image images={entityImages(title)} slot="card" alt="" />
          </Box>
        </AspectRatio>
        <Text size="sm" fw={600} lineClamp={2} h="2.6em">
          {title?.title}
        </Text>
      </Stack>
    </UnstyledButton>
  );
}
function Empty({ tab, kind }: { tab: string; kind: string }) {
  const text: Record<string, string> = {
    posts: kind === "user" ? "No posts yet." : "No posts yet. Details are still arriving.",
    videos: "No videos.",
    community: "No member posts about this yet.",
    cast: "No cast listed.",
    related: "No related titles.",
    credits: "No credits listed.",
    likes: "No likes yet.",
  };
  return (
    <Text c="dimmed" py="xl" ta="center">
      {text[tab]}
    </Text>
  );
}
export function AccountPage({ id }: { id: string }) {
  const key = accountKey(id);
  useLoad(key, (signal) => loadAccount(id, signal));
  const view = useView(key);
  const tabs = tabsFor(id);
  const [tab, setTab] = useState(tabs[0]!);
  const waiting = !view || view.coverage.state === "missing";
  return (
    <Container size="md" px={0} pb="xl">
      <Stack gap="md">
        <Header id={id} />
        {view?.error && (
          <Alert color="red" mx="md">
            {view.error}
          </Alert>
        )}
        <Tabs value={tab} onChange={(value) => value && setTab(value)} keepMounted={false}>
          <Tabs.List grow>
            {tabs.map((t) => (
              <Tabs.Tab key={t} value={t}>
                {tabLabels[t]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {tabs.map((t) => {
            const ids = view?.views[t] ?? [];
            return (
              <Tabs.Panel key={t} value={t} pt={2}>
                {waiting ? (
                  <SimpleGrid cols={3} spacing={2} verticalSpacing={2} aria-busy="true">
                    {Array.from({ length: 9 }, (_, i) => (
                      <AspectRatio key={i} ratio={3 / 4}>
                        <Skeleton radius={0} />
                      </AspectRatio>
                    ))}
                  </SimpleGrid>
                ) : !ids.length ? (
                  <Empty tab={t} kind={accountKind(id)} />
                ) : t === "cast" ? (
                  <Stack gap="sm" p="md">
                    {ids.map((person) => (
                      <AccountRow key={person} id={person} />
                    ))}
                  </Stack>
                ) : t === "related" || t === "credits" ? (
                  <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="sm" p="md">
                    {ids.map((title) => (
                      <TitleTile key={title} id={title} />
                    ))}
                  </SimpleGrid>
                ) : (
                  <PostGrid id={id} tab={t} ids={ids} />
                )}
              </Tabs.Panel>
            );
          })}
        </Tabs>
      </Stack>
    </Container>
  );
}
