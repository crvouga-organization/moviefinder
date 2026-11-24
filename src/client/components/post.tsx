import { useState } from "react";
import {
  ActionIcon,
  AspectRatio,
  Anchor,
  Badge,
  Box,
  Center,
  Group,
  Overlay,
  Skeleton,
  Spoiler,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { Swiper, SwiperSlide } from "swiper/react";
import { A11y, Keyboard } from "swiper/modules";
import { Heart, Images, MessageCircle, Play, Share2, Clapperboard } from "lucide-react";
import { engagementOf, postData, type PostMedia } from "../../shared/contracts";
import { mediaImages } from "../images";
import { act, notify, useEngagement, useEntity, useLiked } from "../state";
import { Image } from "./image";
import { AccountAvatar, AccountLink, accountHandle } from "./account";

const compact = new Intl.NumberFormat("en", { notation: "compact" });
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const shade = "linear-gradient(180deg, transparent 0%, var(--mantine-color-dark-9) 85%)";

function NoImage() {
  return (
    <Center h="100%" w="100%" bg="dark.7">
      <Text c="dimmed">No image</Text>
    </Center>
  );
}
function MediaImage({ media, active, alt }: { media: PostMedia; active: boolean; alt: string }) {
  return (
    <Image
      images={mediaImages(media)}
      slot="feed"
      fit="contain"
      radius={0}
      priority={active}
      alt={alt}
      fallback={<NoImage />}
    />
  );
}
function Video({
  media,
  active,
}: {
  media: Extract<PostMedia, { type: "video" }>;
  active: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  if (playing && active)
    return (
      <Center h="100%" w="100%">
        <AspectRatio ratio={16 / 9} w="100%">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${media.key}?autoplay=1&playsinline=1&rel=0`}
            title={media.name}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </AspectRatio>
      </Center>
    );
  return (
    <Box pos="relative" h="100%" w="100%">
      <Image
        images={mediaImages(media)}
        slot="feed"
        fit="contain"
        radius={0}
        priority={active}
        alt=""
        fallback={<NoImage />}
      />
      <Center pos="absolute" inset={0}>
        <ActionIcon
          size="4rem"
          variant="filled"
          color="yellow"
          radius="xl"
          aria-label={`Play ${media.name}`}
          onClick={() => setPlaying(true)}
        >
          <Play size={32} />
        </ActionIcon>
      </Center>
    </Box>
  );
}
function Gallery({ media, active, title }: { media: PostMedia[]; active: boolean; title: string }) {
  const [index, setIndex] = useState(0);
  return (
    <Box pos="relative" h="100%" w="100%">
      <Box
        component={Swiper}
        h="100%"
        w="100%"
        nested
        modules={[A11y, Keyboard]}
        keyboard={{ enabled: active }}
        onSlideChange={(s: { activeIndex: number }) => setIndex(s.activeIndex)}
      >
        {media.map((item, i) => (
          <SwiperSlide key={`${i}:${item.type === "image" ? item.path : item.key}`}>
            <Box pos="relative" h="100%" w="100%">
              {item.type === "video" ? (
                <Video media={item} active={active && i === index} />
              ) : (
                <MediaImage
                  media={item}
                  active={active && Math.abs(i - index) <= 1}
                  alt={item.label ?? `${title}, image ${i + 1}`}
                />
              )}
              {item.type === "image" && item.link && (
                <Badge
                  pos="absolute"
                  top="var(--mantine-spacing-md)"
                  left="var(--mantine-spacing-md)"
                  size="lg"
                  color="dark"
                  maw="70%"
                  renderRoot={(props) => (
                    <Link {...props} to="/account/$id" params={{ id: item.link! }} />
                  )}
                >
                  {item.label ?? "Open"}
                </Badge>
              )}
            </Box>
          </SwiperSlide>
        ))}
      </Box>
      <Badge
        pos="absolute"
        top="var(--mantine-spacing-md)"
        right="var(--mantine-spacing-md)"
        color="dark"
        ff="monospace"
        w="4.5rem"
        aria-live="polite"
      >
        {index + 1} / {media.length}
      </Badge>
    </Box>
  );
}
export function PostMediaView({ id, active }: { id: string; active: boolean }) {
  const post = useEntity(id, "post");
  const data = postData(post);
  if (!data) return <Skeleton h="100%" w="100%" radius={0} />;
  if (data.format === "text" || !data.media.length)
    return (
      <Center h="100%" w="100%" p="xl" bg="violet.9">
        <Text size="xl" fw={800} ta="center" lineClamp={12}>
          {data.caption}
        </Text>
      </Center>
    );
  if (data.media.length > 1)
    return <Gallery media={data.media} active={active} title={post?.title ?? "Post"} />;
  const media = data.media[0]!;
  return media.type === "video" ? (
    <Video media={media} active={active} />
  ) : (
    <MediaImage media={media} active={active} alt={post?.title ?? ""} />
  );
}

export function share(id: string, title: string) {
  const url = new URL(`/post/${encodeURIComponent(id)}`, location.origin).href;
  if (navigator.share) void navigator.share({ title, url }).catch(() => {});
  else
    void navigator.clipboard.writeText(url).then(
      () => notify("Link copied"),
      () => notify(url),
    );
}
function Count({ value }: { value: number }) {
  return (
    <Text size="xs" fw={700} ff="monospace" ta="center" w="3rem">
      {compact.format(value)}
    </Text>
  );
}
export function PostActions({
  id,
  onComments,
  direction = "column",
}: {
  id: string;
  onComments: () => void;
  direction?: "row" | "column";
}) {
  const post = useEntity(id, "post");
  const liked = useLiked(id);
  const { likes, comments } = engagementOf(useEngagement(id));
  const Wrap = direction === "column" ? Stack : Group;
  return (
    <Wrap gap="xs" align="center">
      <Stack gap={0} align="center">
        <ActionIcon
          variant={liked ? "filled" : "default"}
          color={liked ? "pink" : undefined}
          aria-pressed={liked}
          aria-label={liked ? "Unlike" : "Like"}
          onClick={() => act({ type: "like", postId: id, like: !liked }, "Sign in to like posts.")}
        >
          <Heart size={22} />
        </ActionIcon>
        <Count value={likes} />
      </Stack>
      <Stack gap={0} align="center">
        <ActionIcon variant="default" aria-label="Comments" onClick={onComments}>
          <MessageCircle size={22} />
        </ActionIcon>
        <Count value={comments} />
      </Stack>
      <Stack gap={0} align="center">
        <ActionIcon
          variant="default"
          aria-label="Share"
          onClick={() => share(id, post?.title ?? "")}
        >
          <Share2 size={22} />
        </ActionIcon>
        <Text size="xs" ta="center" w="3rem">
          Share
        </Text>
      </Stack>
    </Wrap>
  );
}
export function PostCaption({ id, lines = 3 }: { id: string; lines?: number }) {
  const post = useEntity(id, "post");
  const data = postData(post);
  const author = useEntity(data?.author);
  if (!data)
    return (
      <Stack gap="xs">
        <Skeleton h="1rem" w="40%" />
        <Skeleton h="0.75rem" w="80%" />
      </Stack>
    );
  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="nowrap">
        <AccountLink id={data.author}>{author?.title ?? "Account"}</AccountLink>
        <Text size="sm" c="dimmed" lineClamp={1}>
          {accountHandle(author, data.author)}
        </Text>
      </Group>
      {data.origin === "catalog" && !!post && !post.title.startsWith(author?.title ?? "\u0000") && (
        <Text fw={700} size="sm" lineClamp={1}>
          {post?.title}
        </Text>
      )}
      {data.caption && data.format !== "text" && (
        <Spoiler maxHeight={lines * 22} showLabel="more" hideLabel="less">
          <Text size="sm">{data.caption}</Text>
        </Spoiler>
      )}
      <Group gap="xs">
        {data.subjects.slice(0, 3).map((subject) => (
          <Subject key={subject} id={subject} />
        ))}
        {data.origin === "user" && data.at && (
          <Text size="xs" c="dimmed">
            {dateFormat.format(new Date(data.at))}
          </Text>
        )}
      </Group>
    </Stack>
  );
}
function Subject({ id }: { id: string }) {
  const account = useEntity(id);
  return (
    <Badge
      variant="light"
      color="yellow"
      maw="12rem"
      renderRoot={(props) => <Link {...props} to="/account/$id" params={{ id }} />}
    >
      {account?.title ?? "Tagged"}
    </Badge>
  );
}
// A full-height post in a vertical feed: media, an action rail and the caption.
export function PostSlide({
  id,
  active,
  onComments,
}: {
  id: string;
  active: boolean;
  onComments: (id: string) => void;
}) {
  const data = postData(useEntity(id, "post"));
  return (
    <Box pos="relative" h="100%" w="100%" bg="dark.9" component="article" aria-label="Post">
      <PostMediaView id={id} active={active} />
      {/* Overlays layer above nested gallery swipers, which form their own stacking context. */}
      <Overlay
        zIndex={2}
        top="auto"
        pt="4rem"
        pb="md"
        pl="md"
        pr="5rem"
        backgroundOpacity={0}
        gradient={shade}
      >
        <PostCaption id={id} />
        <Anchor
          size="sm"
          mt="xs"
          renderRoot={(props) => <Link {...props} to="/post/$id" params={{ id }} />}
        >
          Open post
        </Anchor>
      </Overlay>
      <Overlay
        zIndex={2}
        top="auto"
        left="auto"
        right="var(--mantine-spacing-xs)"
        bottom="6rem"
        backgroundOpacity={0}
        display="flex"
      >
        <Stack gap="md" align="center">
          {data && (
            <UnstyledButton
              aria-label="Open author"
              renderRoot={(props) => (
                <Link {...props} to="/account/$id" params={{ id: data.author }} />
              )}
            >
              <AccountAvatar id={data.author} size="lg" />
            </UnstyledButton>
          )}
          <PostActions id={id} onComments={() => onComments(id)} />
        </Stack>
      </Overlay>
    </Box>
  );
}
// Grid thumbnail for profiles and Explore.
export function PostTile({
  id,
  children,
}: {
  id: string;
  children: (inner: React.ReactNode) => React.ReactNode;
}) {
  const post = useEntity(id, "post");
  const data = postData(post);
  const { likes } = engagementOf(useEngagement(id));
  const lead = data?.media[0];
  const inner = (
    <AspectRatio ratio={3 / 4}>
      <Box pos="relative" h="100%" w="100%" bg="dark.6">
        {!data ? (
          <Skeleton h="100%" w="100%" radius={0} />
        ) : lead ? (
          <Image
            images={mediaImages(lead)}
            slot="tile"
            radius={0}
            alt={post?.title ?? ""}
            fallback={<NoImage />}
          />
        ) : (
          <Center h="100%" p="sm" bg="violet.9">
            <Text size="sm" fw={700} lineClamp={6} ta="center">
              {data.caption}
            </Text>
          </Center>
        )}
        {data && data.format !== "image" && data.format !== "text" && (
          <Box pos="absolute" top="var(--mantine-spacing-xs)" right="var(--mantine-spacing-xs)">
            {data.format === "video" ? (
              <Clapperboard size={18} aria-label="Video" />
            ) : (
              <Images size={18} aria-label="Gallery" />
            )}
          </Box>
        )}
        <Group
          pos="absolute"
          bottom="var(--mantine-spacing-xs)"
          left="var(--mantine-spacing-xs)"
          gap={4}
        >
          <Heart size={14} aria-hidden="true" />
          <Text size="xs" fw={700} ff="monospace">
            {compact.format(likes)}
          </Text>
        </Group>
      </Box>
    </AspectRatio>
  );
  return <>{children(inner)}</>;
}
