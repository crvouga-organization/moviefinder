-- Modify "follow" table
ALTER TABLE "moviefinder"."follow" DROP CONSTRAINT "follow_target_kind_check", ADD CONSTRAINT "follow_target_kind_check" CHECK (target_kind = ANY (ARRAY['user'::text, 'list'::text, 'movie'::text, 'tv'::text, 'person'::text]));
-- Create index "follow_target_idx" to table: "follow"
CREATE INDEX "follow_target_idx" ON "moviefinder"."follow" ("target_id");
-- Create "account_stat" table
CREATE TABLE "moviefinder"."account_stat" (
  "account_id" text NOT NULL,
  "followers" integer NOT NULL DEFAULT 0,
  "following" integer NOT NULL DEFAULT 0,
  "posts" integer NOT NULL DEFAULT 0,
  "version" bigint NOT NULL DEFAULT 1,
  PRIMARY KEY ("account_id"),
  CONSTRAINT "account_stat_followers_check" CHECK (followers >= 0),
  CONSTRAINT "account_stat_following_check" CHECK (following >= 0),
  CONSTRAINT "account_stat_posts_check" CHECK (posts >= 0)
);
-- Create "post_engagement" table
CREATE TABLE "moviefinder"."post_engagement" (
  "post_id" text NOT NULL,
  "likes" integer NOT NULL DEFAULT 0,
  "comments" integer NOT NULL DEFAULT 0,
  "version" bigint NOT NULL DEFAULT 1,
  PRIMARY KEY ("post_id"),
  CONSTRAINT "post_engagement_comments_check" CHECK (comments >= 0),
  CONSTRAINT "post_engagement_likes_check" CHECK (likes >= 0)
);
-- Create "comment" table
CREATE TABLE "moviefinder"."comment" (
  "id" text NOT NULL,
  "post_id" text NOT NULL,
  "user_id" text NOT NULL,
  "body" text NOT NULL,
  "version" bigint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "comment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "moviefinder"."user" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "comment_post_idx" to table: "comment"
CREATE INDEX "comment_post_idx" ON "moviefinder"."comment" ("post_id", "created_at");
-- Create "post" table
CREATE TABLE "moviefinder"."post" (
  "id" text NOT NULL,
  "author_id" text NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "subject_id" text NULL,
  "media" jsonb NOT NULL DEFAULT '[]',
  "version" bigint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "post_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "moviefinder"."user" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "post_author_idx" to table: "post"
CREATE INDEX "post_author_idx" ON "moviefinder"."post" ("author_id", "created_at");
-- Create index "post_created_idx" to table: "post"
CREATE INDEX "post_created_idx" ON "moviefinder"."post" ("created_at");
-- Create index "post_subject_idx" to table: "post"
CREATE INDEX "post_subject_idx" ON "moviefinder"."post" ("subject_id", "created_at");
-- Create "post_like" table
CREATE TABLE "moviefinder"."post_like" (
  "user_id" text NOT NULL,
  "post_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "post_id"),
  CONSTRAINT "post_like_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "moviefinder"."user" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "post_like_post_idx" to table: "post_like"
CREATE INDEX "post_like_post_idx" ON "moviefinder"."post_like" ("post_id");
-- Create index "post_like_user_created_idx" to table: "post_like"
CREATE INDEX "post_like_user_created_idx" ON "moviefinder"."post_like" ("user_id", "created_at");
