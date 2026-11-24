import { useState } from "react";
import {
  Alert,
  AspectRatio,
  Box,
  Button,
  Checkbox,
  CloseButton,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { postData, userAccount, type PostMedia } from "../../shared/contracts";
import { AccountAvatar, accountHandle } from "../components/account";
import { GoogleSignIn } from "../components/google";
import { Image } from "../components/image";
import { mediaImages } from "../images";
import {
  accountKey,
  loadAccount,
  loadSearch,
  searchKey,
  send,
  useEntities,
  useEntity,
  useLoad,
  useView,
  useViewer,
} from "../state";

type ImageMedia = Extract<PostMedia, { type: "image" }>;
function SubjectPicker({ onPick }: { onPick: (id: string) => void }) {
  const [text, setText] = useState("");
  const [q] = useDebouncedValue(text.trim(), 300);
  const key = q ? searchKey(q) : undefined;
  useLoad(key, (signal) => loadSearch(q, signal));
  const view = useView(key);
  const ids = (view?.ids ?? []).filter((id) => id.startsWith("tmdb:")).slice(0, 8);
  return (
    <Stack gap="xs">
      <TextInput
        label="Tag a movie, show or person"
        placeholder="Search"
        leftSection={<Search size={18} />}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      <Stack gap={4} mih={q ? "12rem" : undefined}>
        {ids.map((id) => (
          <Choice key={id} id={id} onPick={onPick} />
        ))}
        {q && view && !ids.length && view.coverage.state !== "partial" && (
          <Text size="sm" c="dimmed">
            No matches.
          </Text>
        )}
      </Stack>
    </Stack>
  );
}
function Choice({ id, onPick }: { id: string; onPick: (id: string) => void }) {
  const account = useEntity(id);
  return (
    <UnstyledButton onClick={() => onPick(id)} aria-label={`Tag ${account?.title ?? id}`}>
      <Group gap="sm" wrap="nowrap">
        <AccountAvatar id={id} />
        <Stack gap={0}>
          <Text fw={700} lineClamp={1}>
            {account?.title}
          </Text>
          <Text size="xs" c="dimmed">
            {accountHandle(account, id)}
          </Text>
        </Stack>
      </Group>
    </UnstyledButton>
  );
}
// The tagged account's artwork, offered as attachments.
function ArtworkPicker({
  subject,
  chosen,
  onChange,
}: {
  subject: string;
  chosen: ImageMedia[];
  onChange: (media: ImageMedia[]) => void;
}) {
  const key = accountKey(subject);
  useLoad(key, (signal) => loadAccount(subject, signal));
  const posts = useEntities("post", useView(key)?.views.posts ?? []);
  const options = [
    ...new Map(
      posts
        .flatMap((p) => postData(p)?.media ?? [])
        .filter((m): m is ImageMedia => m.type === "image")
        .map((m) => [
          m.path,
          { type: "image", role: m.role, path: m.path, aspect: m.aspect } as ImageMedia,
        ]),
    ).values(),
  ].slice(0, 24);
  if (!options.length) return null;
  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        Attach artwork (up to 10)
      </Text>
      <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="xs">
        {options.map((media) => {
          const selected = chosen.some((c) => c.path === media.path);
          return (
            <Box key={media.path} pos="relative">
              <AspectRatio ratio={3 / 4}>
                <Image images={mediaImages(media)} slot="tile" alt="" />
              </AspectRatio>
              <Checkbox
                pos="absolute"
                top="var(--mantine-spacing-xs)"
                left="var(--mantine-spacing-xs)"
                aria-label="Attach this image"
                checked={selected}
                disabled={!selected && chosen.length >= 10}
                onChange={() =>
                  onChange(
                    selected ? chosen.filter((c) => c.path !== media.path) : [...chosen, media],
                  )
                }
              />
            </Box>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}
export function CreatePage() {
  const me = useViewer();
  const navigate = useNavigate();
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState<string>();
  const [media, setMedia] = useState<ImageMedia[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const tagged = useEntity(subject);
  if (!me)
    return (
      <Container size="xs" py="xl">
        <Paper withBorder p="xl" radius="lg">
          <Stack gap="md">
            <Title order={1}>Create a post</Title>
            <Text c="dimmed">Sign in to share posts about movies, shows and people.</Text>
            <GoogleSignIn returnTo="/create" />
          </Stack>
        </Paper>
      </Container>
    );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await send({ type: "post.create", body: body.trim(), subjectId: subject, media });
      void navigate({ to: "/account/$id", params: { id: userAccount(me!) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your post couldn’t be shared");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Container size="sm" py="md">
      <Stack component="form" onSubmit={submit} gap="lg">
        <Title order={1}>Create a post</Title>
        <Textarea
          label="Caption"
          placeholder="What are you watching?"
          autosize
          minRows={4}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
        />
        {subject ? (
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <AccountAvatar id={subject} />
              <Text fw={700}>Tagged: {tagged?.title}</Text>
            </Group>
            <CloseButton
              aria-label="Remove tag"
              onClick={() => {
                setSubject(undefined);
                setMedia([]);
              }}
            />
          </Group>
        ) : (
          <SubjectPicker onPick={setSubject} />
        )}
        {subject && <ArtworkPicker subject={subject} chosen={media} onChange={setMedia} />}
        {error && <Alert color="red">{error}</Alert>}
        <Button type="submit" disabled={busy || (!body.trim() && !media.length)}>
          Share
        </Button>
      </Stack>
    </Container>
  );
}
