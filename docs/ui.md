# UI conventions

Read this before changing browser UI. React and Mantine 9.7.3 are the only UI
framework and design system. Use the [official component documentation](https://mantine.dev/)
and the installed package types before implementing an unfamiliar interaction.

## Screen inventory

| Area             | Routes / interactions                                                                    | Mantine composition                                        |
| ---------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Shell            | Every route; desktop sidebar, mobile bottom tab bar, skip link, 404                      | AppShell, NavLink, UnstyledButton, Avatar                  |
| Feeds            | `/` (For You, `?topic=`), `/following`, `/watch?account=&tab=&start=` / `?feed=explore`  | Swiper (vertical), Overlay, SegmentedControl, Chip, Drawer |
| Posts            | Slide media (image, gallery, video tap-to-play, text), action rail, caption, comments    | Image, AspectRatio, ActionIcon, Spoiler, Badge, Drawer     |
| Explore          | `/explore?q=&topic=`, account search results, 3-column post grid with infinite loading   | TextInput, SimpleGrid, AspectRatio, Skeleton               |
| Account profiles | `/account/$id` for movies, series, people and members; follow, edit profile, sign out    | Avatar, Tabs, SimpleGrid, ScrollArea, Spoiler, Drawer      |
| Single post      | `/post/$id`: media, caption, follow, actions, comments                                   | Grid, Paper, TextInput                                     |
| Create           | `/create`: caption, tag a title/person, attach its artwork                               | Textarea, TextInput, Checkbox, SimpleGrid                  |
| Sign-in          | `/auth`, `/me` when signed out, and the sign-in prompt opened by any visitor interaction | Modal, Paper, Stack, Google branded action                 |

All routes are public. TanStack Router routes, canonical DB collections, optimistic command IDs,
API/domain behavior and backend permissions remain authoritative.

## Start here

- `src/client/theme.ts` is the only theme. Its playful cinema presentation uses
  Mantine's built-in dark/gray surfaces, yellow primary actions and violet, pink
  and cyan accents. Surfaces use the standard `lg` radius, controls use `xl`
  pill radii, and spacing, shadows and breakpoints remain Mantine tokens.
  The app uses a dark color scheme and system sans-serif typography with bold
  headings. There are no downloaded fonts or font swaps. Existing semantic
  variables define readable gray text and warm links centrally.
  Do not add feature themes, custom palettes or token systems.
- `src/client/providers.tsx` is the only provider configuration. `main.tsx` imports
  Mantine package CSS once. Every rendered entry point must use `Providers`.
- `components/shell.tsx` owns `AppShell`, the desktop sidebar and the mobile bottom
  tab bar (For You, Following, Explore, Post, Profile).
  The brand mark is 🍿, decorative beside MovieFinder. `public/icon.svg` uses
  the same emoji for the favicon.
- Feed routes fill `AppShell.Main` edge to edge (`feedHeight` subtracts the mobile tab
  bar); other routes use a `Container`. Every route has one h1. Use plain app labels:
  For You, Following, Explore, Post, Profile. No slogans or promotional copy.
- Artwork is the visual focus. Title cards frame reserved poster and metadata
  slots in Mantine Card; dark Paper surfaces and divided section headings group
  secondary content. Bright static film strips, popcorn and cinema stickers,
  dashed ticket separators and colourful reaction pills give the UI personality.
  Movie accents are warm yellow/pink; person accents are cyan/violet. These are
  built-in Mantine colours, not feature themes. Decoration is noninteractive,
  aria-hidden, and mounted in the shared geometry before data arrives.
  Keep decoration in Mantine compositions and supported props, without custom CSS.

## Compose first

1. Check whether Mantine has the component or behavior.
2. Configure its supported props or compose existing Mantine components.
3. Reuse a product composition only when it fits. Do not wrap individual primitives.
4. Introduce a new abstraction only for recurring product behavior or a semantic contract.

Use `Stack` vertically, `Group` horizontally, `Flex` for direction changes, and
`Grid`/`SimpleGrid` for responsive columns. Standard title grids use 2 / 3 / 4 / 5
columns at base / xs / md / lg. List grids use 1 / 2 / 3 at base / xs / lg.
Use theme spacing (`xs`, `sm`, `md`, `lg`, `xl`), component sizes and default radii.
Keep numeric dimensions for structural geometry, artwork aspect ratios and icons only.
Box geometry props such as `h`, `w`, `top` and `left` take CSS lengths: reference
`var(--mantine-spacing-sm)` rather than passing a bare spacing key. Component
`size`, `radius`, padding, margin and gap props resolve their supported theme keys.
Use `renderRoot` with a typed TanStack `Link` for Mantine links and linked cards.
The bounded discovery feed stacks artwork and controls below md so tablet content
is not compressed beside the sidebar. Its title actions use the compact Mantine
size; other actions inherit the shared defaults.

- Primary action: default `Button`. Secondary: `variant="default"`. Tertiary:
  `variant="subtle"`. Destructive: `color="red"`. Icon actions: `ActionIcon` with
  an accessible name. Toggle actions: `aria-pressed` and a distinct selected state.
  Title reactions use coloured `light` pills, becoming `filled` when selected;
  other toggles keep their established selected variants.
- Inputs: labeled Mantine controls. Simple forms use native `FormData`, browser
  constraints and existing Zod contracts. Mantine `NumberInput` and `DateInput`
  handle numeric and calendar controls. Show errors with `Alert`/input `error` or
  the shared notification bridge; retain form values after failures. Disable
  submission during commands. No spinning indicators (product requirement).
- Editing and selection: `Drawer`. Short named input: `Modal`. Preserve Mantine's
  Escape, focus trap, accessible title, close button and return focus behavior.
  No `window.prompt`, `alert` or `confirm`.
- Tabs: `Tabs.List`, `Tabs.Tab`, **and `Tabs.Panel`**. Type selection uses
  `SegmentedControl`. Use built-in keyboard and selected states.
- Loading: nonanimated `Skeleton` or concise status text. Empty: shared `Empty`.
  Errors: `Alert` and a retry where possible. Mutation feedback: existing `notify`
  / `report` bridge to Mantine notifications. Preserve optimistic operations.
- Artwork: shared `Image` and `Poster` preserve source selection, fallbacks,
  responsive sources, lazy loading and telemetry. Do not build TMDB URLs in views.

## Accessibility and responsive behavior

Keep one h1, then h2 sections and h3 items. Label every form control and icon
action. Preserve visible focus, native keyboard behavior, meaningful image text
and Mantine reduced-motion support. Use theme responsive props, not media queries.
Wrap actions on narrow screens and use scroll areas for intentionally bounded
content. Tables, if added, need Mantine `Table.ScrollContainer` or an equivalent
narrow-screen strategy. Do not use a disabled control without explaining its state.

## Layout stability

Treat loading, empty, error and complete data as states of the same fixed geometry.
Do not insert async feedback above content or allow fetched text to resize controls.

- Native page scrollbar space is permanent. Mantine scroll areas use `type="always"`
  centrally. Never use `auto`, `hover`, `scroll`, `never` or dynamic
  `offsetScrollbars="present"`.
- Modal/Drawer keep the page gutter (`removeScrollProps.removeScrollBar=false`).
  Notifications are stacked, top anchored and untransitioned.
- Feeds reserve the full slide before posts arrive; the trailing slide is a skeleton,
  an error with retry, an empty state or "all caught up". Feed ordering is append-only.
  Media frames never resize: images use `fit="contain"` in the slide and `AspectRatio`
  in grids; counters use fixed-width monospace slots.
- Profiles reserve the cover, avatar, one-line name and handle (non-breaking space
  placeholders), stats, a single horizontally scrolling facts/genre row and a fixed
  overview block that fits the collapsed text and its "more" control. Tab panels show
  a 3×3 skeleton grid until the account read arrives.
- Explore and profile grids append tiles below existing ones; skeleton tiles share the
  same aspect ratio.
- Read existing canonical collection rows while live-query subscriptions attach;
  never flash known content empty or copy server entities into component caches.

Run `bun run test:e2e layout-stability.spec.ts`. It delays feed and profile reads and
rejects every layout-shift event, including tiny shifts and those just after input; do
not round them or add a tolerance.

## Styling policy and exceptions

Default custom CSS is zero. Do not add styling dependencies, utility classes,
CSS modules, inline `style`, `styles`, `classNames`, or selectors for Mantine internals.
Use Mantine props and defaults. New CSS requires a concrete Mantine limitation
recorded here and a narrow exception in the architecture check.

`src/client/interactions.css` contains only three functional exceptions:

- The browser viewport has no Mantine component. Its root always uses
  `overflow-y: scroll` and `scrollbar-gutter: stable`; do not change either.

- Mantine 9.7.3's scrollbar thumb centers a minimum-size hit-area pseudo-element.
  Chromium attributed raw shifts below 0.000001 to it while reporting identical
  previous/current rectangles during progressive search. The supported
  [ScrollArea Styles API](https://mantine.dev/core/scroll-area/) assigns one theme
  class that anchors the existing hit area at its host origin instead of centering
  it with percentage offsets. This version-specific exception preserves its
  minimum size, pseudo-element, thumb
  sizing, dragging and viewport touch/keyboard scrolling. Do not target generated
  Mantine classes, remove its hit area, or suppress telemetry entries.
  Reverify this exception when upgrading Mantine.

- Mantine `VisuallyHidden` has no reveal-on-focus API. The skip link is clipped
  until focus and layered above the fixed shell. Focus styles come from Mantine.

Swiper is retained for virtual vertical feeds and horizontal galleries, which
Mantine does not provide. Its viewport uses a Mantine `Box` size prop; all slide
content and actions use Mantine. A Swiper root creates its own stacking context
(`z-index: 1`), so anything layered over a feed or gallery (feed header, slide
caption and action rail, watch back button) uses Mantine `Overlay` with its
`zIndex` prop and explicit insets instead of a plain positioned `Box`.
Horizontal topic chips sit in a `ScrollArea` with `scrollbars="x"`.

The official Google sign-in bitmap remains unmodified inside `UnstyledButton`.
It is a narrow provider-brand requirement, not a new application button primitive.
Lucide supplies icons only. Existing unstyled class names on cards/detail views
are stable browser/performance hooks; they carry no visual rules.

## Checks

Run `bun run check` and `bun run build` after UI changes. Run `bun run test:e2e`
for interactions, navigation, narrow layouts and accessibility; run
`bun run test:integration` when contracts or command behavior could be affected.
`tests/unit/ui-architecture.test.ts` enforces styling/dependency/provider boundaries.
Browser tests preserve existing workflows and latency requirements. Do not weaken
checks or remove functionality to clear failures.
