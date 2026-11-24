import { useEffect, useState } from "react";
import {
  Alert,
  AspectRatio,
  Button,
  Container,
  Divider,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue, useIntersection } from "@mantine/hooks";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AccountRow } from "../components/account";
import { PostTile } from "../components/post";
import { loadSearch, searchKey, useFeed, useLoad, useView } from "../state";
import { TopicChips } from "./home";

function SearchResults({ q }: { q: string }) {
  const key = searchKey(q);
  useLoad(key, (signal) => loadSearch(q, signal));
  const view = useView(key);
  const waiting = !view || view.coverage.state === "missing" || view.coverage.state === "partial";
  return (
    <Stack gap="md" component="section" aria-label="Accounts">
      <Title order={2}>Accounts</Title>
      {view?.error && <Alert color="red">{view.error}</Alert>}
      {view?.ids.map((id) => (
        <AccountRow key={id} id={id} />
      ))}
      {waiting &&
        [0, 1, 2].map((i) => <Skeleton key={i} h="3.5rem" radius="lg" aria-hidden="true" />)}
      {!waiting && !view?.ids.length && <Text c="dimmed">No accounts match “{q}”.</Text>}
    </Stack>
  );
}
function ExploreGrid({ topic }: { topic: string }) {
  const feed = useFeed({ feed: "explore", topic });
  const { ref, entry } = useIntersection({ rootMargin: "800px" });
  useEffect(() => {
    if (entry?.isIntersecting) feed.more();
  }, [entry?.isIntersecting, feed.ids.length]);
  return (
    <Stack gap="md">
      <SimpleGrid cols={3} spacing={2} verticalSpacing={2}>
        {feed.ids.map((id) => (
          <PostTile key={id} id={id}>
            {(inner) => (
              <UnstyledButton
                aria-label="Open post"
                renderRoot={(props) => (
                  <Link {...props} to="/watch" search={{ feed: "explore", topic, start: id }} />
                )}
              >
                {inner}
              </UnstyledButton>
            )}
          </PostTile>
        ))}
        {feed.loading &&
          Array.from({ length: 9 }, (_, i) => (
            <AspectRatio key={`s${i}`} ratio={3 / 4} aria-hidden="true">
              <Skeleton radius={0} />
            </AspectRatio>
          ))}
      </SimpleGrid>
      {feed.error && (
        <Alert color="red" title="Explore couldn’t load">
          {feed.error}
          <Button mt="sm" variant="default" onClick={feed.retry}>
            Try again
          </Button>
        </Alert>
      )}
      {!feed.loading && !feed.ids.length && !feed.error && (
        <Text c="dimmed">No posts for this topic yet.</Text>
      )}
      <div ref={ref} aria-hidden="true" />
    </Stack>
  );
}
export function ExplorePage({ q, topic }: { q: string; topic: string }) {
  const navigate = useNavigate();
  const [text, setText] = useState(q);
  const [debounced] = useDebouncedValue(text.trim(), 300);
  useEffect(() => {
    if (debounced !== q)
      void navigate({ to: "/explore", search: debounced ? { q: debounced } : {}, replace: true });
  }, [debounced]);
  return (
    <Container size="md" py="md" px="sm">
      <Stack gap="md">
        <Title order={1}>Explore</Title>
        <TextInput
          type="search"
          aria-label="Search accounts"
          placeholder="Search movies, shows, people and members"
          leftSection={<Search size={18} />}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
        />
        {q ? (
          <SearchResults q={q} />
        ) : (
          <>
            <TopicChips
              value={topic}
              onChange={(next) =>
                void navigate({ to: "/explore", search: next === "all" ? {} : { topic: next } })
              }
            />
            <Divider />
            <ExploreGrid key={topic} topic={topic} />
          </>
        )}
      </Stack>
    </Container>
  );
}
