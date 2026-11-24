import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Box, Button, Center, Skeleton, Stack, Text, Title } from "@mantine/core";
import { Swiper, SwiperSlide } from "swiper/react";
import { A11y, Keyboard, Mousewheel, Virtual } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { CommentsDrawer } from "./comments";
import { PostSlide } from "./post";
import { track } from "../telemetry";

// Feed height fills the viewport above the mobile tab bar.
export const feedHeight = "calc(100dvh - var(--app-shell-footer-offset, 0rem))";
// Where each feed was left, so returning from a profile or post resumes in place.
const positions = new Map<string, number>();

export function VerticalFeed({
  feedKey,
  ids,
  loading,
  exhausted,
  error,
  onMore,
  onRetry,
  empty,
  start,
  label,
}: {
  feedKey: string;
  ids: string[];
  loading: boolean;
  exhausted: boolean;
  error?: string;
  onMore: () => void;
  onRetry: () => void;
  empty: ReactNode;
  start?: string;
  label: string;
}) {
  const swiper = useRef<SwiperType | null>(null);
  const initial = start && ids.includes(start) ? ids.indexOf(start) : (positions.get(feedKey) ?? 0);
  const [active, setActive] = useState(initial);
  const [comments, setComments] = useState<string>();
  const startedAt = useRef(start);
  // A shared link may arrive before its page does; jump once it appears.
  useEffect(() => {
    if (startedAt.current && ids.includes(startedAt.current)) {
      swiper.current?.slideTo(ids.indexOf(startedAt.current), 0);
      startedAt.current = undefined;
    }
  }, [ids]);
  useEffect(() => {
    if (ids.length && active >= ids.length - 4) onMore();
  }, [active, ids.length]);
  const tail = error ? (
    <Center h="100%" p="xl">
      <Stack align="center" maw="24rem">
        <Alert color="red" title="This feed couldn’t load">
          {error}
        </Alert>
        <Button onClick={onRetry}>Try again</Button>
      </Stack>
    </Center>
  ) : loading ? (
    <Stack h="100%" p="md" justify="flex-end" aria-busy="true" aria-label="Loading more posts">
      <Skeleton h="60%" radius="lg" />
      <Skeleton h="1rem" w="40%" />
      <Skeleton h="0.75rem" w="70%" />
    </Stack>
  ) : ids.length ? (
    <Center h="100%" p="xl">
      <Stack align="center" gap="xs">
        <Title order={2}>You’re all caught up</Title>
        <Text c="dimmed">Follow more accounts or explore topics for more posts.</Text>
      </Stack>
    </Center>
  ) : (
    <Center h="100%" p="xl">
      {empty}
    </Center>
  );
  const slides = [...ids, exhausted && ids.length && !error ? "end" : "tail"];
  return (
    <Box
      h={feedHeight}
      w="100%"
      maw="36rem"
      mx="auto"
      component="section"
      aria-label={label}
      aria-busy={loading}
    >
      <Box
        component={Swiper}
        h="100%"
        direction="vertical"
        modules={[Keyboard, Mousewheel, Virtual, A11y]}
        slidesPerView={1}
        initialSlide={initial}
        mousewheel={{ forceToAxis: true, thresholdDelta: 30 }}
        keyboard={{ enabled: true }}
        virtual={{ enabled: true, addSlidesBefore: 1, addSlidesAfter: 2, cache: false }}
        onSwiper={(s: SwiperType) => {
          swiper.current = s;
        }}
        onSlideChange={(s: SwiperType) => {
          setActive(s.activeIndex);
          positions.set(feedKey, s.activeIndex);
          track("feed", "advance", { index: s.activeIndex });
        }}
      >
        {slides.map((id, index) => (
          <SwiperSlide key={id} virtualIndex={index}>
            {id === "tail" || id === "end" ? (
              tail
            ) : (
              <PostSlide id={id} active={index === active} onComments={setComments} />
            )}
          </SwiperSlide>
        ))}
      </Box>
      <CommentsDrawer postId={comments} onClose={() => setComments(undefined)} />
    </Box>
  );
}
