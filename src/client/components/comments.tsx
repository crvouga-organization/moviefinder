import { useState } from "react";
import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Trash2 } from "lucide-react";
import { fieldText, postData, userAccount } from "../../shared/contracts";
import {
  act,
  loadPost,
  postKey,
  send,
  SignInRequired,
  report,
  useEntities,
  useEntity,
  useLoad,
  useView,
  useViewer,
} from "../state";
import { AccountAvatar, AccountLink } from "./account";
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(iso: string) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  for (const [unit, size] of [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ] as const)
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return "just now";
}

function Comment({ id, postAuthor }: { id: string; postAuthor?: string }) {
  const comment = useEntity(id, "comment");
  const me = useViewer();
  const author = fieldText(comment?.data.author);
  const user = useEntity(author || undefined, "user");
  if (!comment) return null;
  const removable = !!me && (author === userAccount(me) || postAuthor === userAccount(me));
  return (
    <Group align="flex-start" wrap="nowrap" gap="sm" component="li">
      <AccountAvatar id={author} size="md" />
      <Stack gap={2} flex={1} miw={0}>
        <Group gap="xs" wrap="nowrap">
          <AccountLink id={author}>{user?.title ?? "Member"}</AccountLink>
          <Text size="xs" c="dimmed">
            {comment.data.pending ? "Posting…" : ago(fieldText(comment.data.at))}
          </Text>
        </Group>
        <Text size="sm">{comment.title}</Text>
      </Stack>
      {removable && (
        <ActionIcon
          size="md"
          aria-label="Delete comment"
          onClick={() => act({ type: "comment.delete", commentId: id })}
        >
          <Trash2 size={16} />
        </ActionIcon>
      )}
    </Group>
  );
}
export function Comments({ postId, height = "24rem" }: { postId: string; height?: string }) {
  const key = postKey(postId);
  useLoad(key, (signal) => loadPost(postId, signal));
  const view = useView(key);
  const ids = view?.views.comments ?? [];
  const comments = useEntities("comment", ids);
  const author = postData(useEntity(postId, "post"))?.author;
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    try {
      const pending = send({ type: "comment.create", postId, body: text }, "Sign in to comment.");
      setBody("");
      await pending;
    } catch (error) {
      if (error instanceof SignInRequired) return;
      setBody(text);
      report(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack gap="md">
      <ScrollArea h={height} aria-label="Comments">
        {!view ? (
          <Stack gap="md">
            {[0, 1, 2].map((i) => (
              <Group key={i} wrap="nowrap">
                <Skeleton circle h="2.4rem" />
                <Skeleton h="2rem" flex={1} />
              </Group>
            ))}
          </Stack>
        ) : comments.length ? (
          <Stack component="ul" gap="md" p={0} m={0} pr="xs">
            {comments.map((c) => (
              <Comment key={c.id} id={c.id} postAuthor={author} />
            ))}
          </Stack>
        ) : (
          <Text c="dimmed">No comments yet. Start the conversation.</Text>
        )}
      </ScrollArea>
      <Group component="form" onSubmit={submit} wrap="nowrap" gap="xs">
        <TextInput
          flex={1}
          aria-label="Add a comment"
          placeholder="Add a comment…"
          value={body}
          maxLength={1000}
          onChange={(event) => setBody(event.currentTarget.value)}
        />
        <Button type="submit" disabled={busy || !body.trim()}>
          Post
        </Button>
      </Group>
    </Stack>
  );
}
export function CommentsDrawer({ postId, onClose }: { postId?: string; onClose: () => void }) {
  return (
    <Drawer opened={!!postId} onClose={onClose} position="bottom" size="70%" title="Comments">
      {postId && <Comments postId={postId} height="calc(70dvh - 10rem)" />}
    </Drawer>
  );
}
