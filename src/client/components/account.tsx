import { Anchor, Avatar, Button, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { Check, Plus } from "lucide-react";
import { accountKind, fieldText, type Entity } from "../../shared/contracts";
import { entityImages, resolveImage } from "../images";
import { act, useEntity, useFollowing, useViewer } from "../state";
import { userAccount } from "../../shared/contracts";

export const kindLabel = {
  movie: "Movie",
  tv: "Series",
  person: "Person",
  user: "Member",
} as const;
export function accountHandle(account: Entity | undefined, id: string) {
  const kind = accountKind(id);
  if (kind === "user") {
    const username = fieldText(account?.data.username);
    return username ? `@${username}` : "Member";
  }
  if (kind === "person") return fieldText(account?.data.department) || "Person";
  return [kindLabel[kind], account?.year].filter(Boolean).join(" · ");
}
export function AccountAvatar({
  id,
  size = "md",
}: {
  id: string;
  size?: "sm" | "md" | "lg" | "xl" | number;
}) {
  const account = useEntity(id);
  const image = resolveImage(entityImages(account), "avatar");
  return (
    <Avatar
      src={image?.src}
      alt=""
      size={size}
      radius="xl"
      color={
        accountKind(id) === "person" ? "cyan" : accountKind(id) === "user" ? "violet" : "yellow"
      }
    >
      {(account?.title ?? "?").slice(0, 1)}
    </Avatar>
  );
}
export function AccountLink({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Anchor
      c="inherit"
      fw={700}
      lineClamp={1}
      renderRoot={(props) => <Link {...props} to="/account/$id" params={{ id }} />}
    >
      {children}
    </Anchor>
  );
}
export function FollowButton({ id, size = "sm" }: { id: string; size?: "xs" | "sm" | "md" }) {
  const me = useViewer();
  const following = useFollowing(id);
  const account = useEntity(id);
  if (me && userAccount(me) === id) return null;
  return (
    <Button
      size={size}
      w="7.5rem"
      variant={following ? "default" : "filled"}
      leftSection={following ? <Check size={16} /> : <Plus size={16} />}
      aria-pressed={following}
      aria-label={`${following ? "Unfollow" : "Follow"} ${account?.title ?? "account"}`}
      onClick={() =>
        act(
          { type: "follow", accountId: id, follow: !following },
          `Sign in to follow ${account?.title ?? "this account"}.`,
        )
      }
    >
      {following ? "Following" : "Follow"}
    </Button>
  );
}
// One row in search results, cast lists and similar account collections.
export function AccountRow({ id }: { id: string }) {
  const account = useEntity(id);
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm">
      <UnstyledButton
        renderRoot={(props) => <Link {...props} to="/account/$id" params={{ id }} />}
        miw={0}
        flex={1}
      >
        <Group wrap="nowrap" gap="sm">
          <AccountAvatar id={id} size="lg" />
          <Stack gap={0} miw={0}>
            <Text fw={700} lineClamp={1}>
              {account?.title ?? "Loading…"}
            </Text>
            <Text size="sm" c="dimmed" lineClamp={1}>
              {accountHandle(account, id)}
            </Text>
          </Stack>
        </Group>
      </UnstyledButton>
      <FollowButton id={id} size="xs" />
    </Group>
  );
}
