import { ActionIcon, Alert, Box, Container, Grid, Paper, Stack, Title } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Comments } from "../components/comments";
import { PostActions, PostCaption, PostMediaView } from "../components/post";
import { loadPost, postKey, useLoad, useView } from "../state";
import { FollowButton } from "../components/account";
import { postData } from "../../shared/contracts";
import { useEntity } from "../state";

// A shared post: its media, caption and conversation.
export function PostPage({ id }: { id: string }) {
  const key = postKey(id);
  useLoad(key, (signal) => loadPost(id, signal));
  const view = useView(key);
  const router = useRouter();
  const author = postData(useEntity(id, "post"))?.author;
  return (
    <Container size="lg" py="md" px="sm">
      <Stack gap="md">
        <ActionIcon variant="default" aria-label="Back" onClick={() => router.history.back()}>
          <ArrowLeft size={20} />
        </ActionIcon>
        <Title order={1} size="h3">
          Post
        </Title>
        {view?.error && <Alert color="red">{view.error}</Alert>}
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Paper withBorder radius="lg" h={{ base: "70dvh", md: "80dvh" }} bg="dark.9">
              <Box h="100%" w="100%">
                <PostMediaView id={id} active />
              </Box>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Stack gap="md">
              <PostCaption id={id} lines={8} />
              {author && <FollowButton id={author} />}
              <PostActions id={id} direction="row" onComments={() => {}} />
              <Title order={2} size="h4">
                Comments
              </Title>
              <Comments postId={id} height="22rem" />
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
