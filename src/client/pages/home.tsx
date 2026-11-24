import {
  Box,
  Button,
  Chip,
  Group,
  Overlay,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Link, useNavigate } from "@tanstack/react-router";
import { topics, type FeedKind } from "../../shared/contracts";
import { VerticalFeed } from "../components/feed";
import { requestSignIn, useFeed, useViewer } from "../state";

export function TopicChips({
  value,
  onChange,
}: {
  value: string;
  onChange: (topic: string) => void;
}) {
  return (
    <ScrollArea scrollbars="x" offsetScrollbars="x">
      <Chip.Group multiple={false} value={value} onChange={onChange}>
        <Group gap="xs" wrap="nowrap" py={4} role="group" aria-label="Topics">
          {topics.map((t) => (
            <Chip key={t.id} value={t.id} size="sm" variant="filled">
              {t.label}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
    </ScrollArea>
  );
}
// For You and Following share one screen with a TikTok-style switch above the feed.
export function HomePage({
  feed,
  topic,
}: {
  feed: Extract<FeedKind, "foryou" | "following">;
  topic: string;
}) {
  const navigate = useNavigate();
  const me = useViewer();
  const state = useFeed({ feed, topic: feed === "following" ? "all" : topic });
  return (
    <Box pos="relative">
      <Overlay
        component="header"
        zIndex={2}
        bottom="auto"
        maw="36rem"
        mx="auto"
        p="sm"
        backgroundOpacity={0}
        gradient="linear-gradient(0deg, transparent 0%, var(--mantine-color-dark-9) 100%)"
      >
        <Stack gap="xs">
          <Title order={1} size="h3">
            {feed === "foryou" ? "For You" : "Following"}
          </Title>
          <SegmentedControl
            size="sm"
            radius="xl"
            value={feed}
            aria-label="Feed"
            data={[
              { value: "following", label: "Following" },
              { value: "foryou", label: "For You" },
            ]}
            onChange={(value) => void navigate({ to: value === "following" ? "/following" : "/" })}
          />
          {feed === "foryou" && (
            <TopicChips
              value={topic}
              onChange={(next) =>
                void navigate({ to: "/", search: next === "all" ? {} : { topic: next } })
              }
            />
          )}
        </Stack>
      </Overlay>
      <VerticalFeed
        key={`${feed}:${topic}`}
        feedKey={`${feed}:${topic}`}
        label={feed === "foryou" ? "For You feed" : "Following feed"}
        ids={state.ids}
        loading={state.loading}
        exhausted={state.exhausted}
        error={state.error}
        onMore={state.more}
        onRetry={state.retry}
        empty={
          feed === "following" && !me ? (
            <Stack align="center" gap="sm" maw="22rem" ta="center">
              <Title order={2}>Your Following feed</Title>
              <Text c="dimmed">Sign in to follow movies, shows, people and members.</Text>
              <Button onClick={() => requestSignIn("Sign in to build your Following feed.")}>
                Sign in
              </Button>
            </Stack>
          ) : feed === "following" ? (
            <Stack align="center" gap="sm" maw="22rem" ta="center">
              <Title order={2}>Nothing here yet</Title>
              <Text c="dimmed">Follow movies, shows, people and members to fill this feed.</Text>
              <Button renderRoot={(props) => <Link {...props} to="/explore" />}>
                Explore accounts
              </Button>
            </Stack>
          ) : (
            <Stack align="center" gap="sm" ta="center">
              <Title order={2}>No posts for this topic</Title>
              <Text c="dimmed">Try another topic.</Text>
            </Stack>
          )
        }
      />
    </Box>
  );
}
