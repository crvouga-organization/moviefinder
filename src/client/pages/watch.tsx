import { ActionIcon, Box, Overlay, Text } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { VerticalFeed } from "../components/feed";
import { accountKey, loadAccount, useEntity, useFeed, useLoad, useView } from "../state";

function Back({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Overlay zIndex={2} bottom="auto" right="auto" p="sm" backgroundOpacity={0}>
      <ActionIcon
        variant="filled"
        color="dark"
        aria-label={label}
        onClick={() => router.history.back()}
      >
        <ArrowLeft size={20} />
      </ActionIcon>
    </Overlay>
  );
}
// An account tab played as a vertical feed, starting at the tapped post.
function AccountWatch({ account, tab, start }: { account: string; tab: string; start?: string }) {
  const key = accountKey(account);
  useLoad(key, (signal) => loadAccount(account, signal));
  const view = useView(key);
  const owner = useEntity(account);
  const ids = view?.views[tab] ?? [];
  return (
    <Box pos="relative">
      <Back label="Back to profile" />
      <VerticalFeed
        feedKey={`account:${account}:${tab}`}
        label={`${owner?.title ?? "Account"} posts`}
        ids={ids}
        start={start}
        loading={!view}
        exhausted={!!view}
        error={view?.error}
        onMore={() => {}}
        onRetry={() => void loadAccount(account)}
        empty={<Text c="dimmed">No posts yet.</Text>}
      />
    </Box>
  );
}
function FeedWatch({ topic, start }: { topic: string; start?: string }) {
  const feed = useFeed({ feed: "explore", topic });
  return (
    <Box pos="relative">
      <Back label="Back to Explore" />
      <VerticalFeed
        feedKey={`explore:${topic}`}
        label="Explore feed"
        ids={feed.ids}
        start={start}
        loading={feed.loading}
        exhausted={feed.exhausted}
        error={feed.error}
        onMore={feed.more}
        onRetry={feed.retry}
        empty={<Text c="dimmed">No posts for this topic yet.</Text>}
      />
    </Box>
  );
}
export function WatchPage(search: {
  account?: string;
  tab?: string;
  topic?: string;
  start?: string;
}) {
  return search.account ? (
    <AccountWatch account={search.account} tab={search.tab ?? "posts"} start={search.start} />
  ) : (
    <FeedWatch topic={search.topic ?? "all"} start={search.start} />
  );
}
