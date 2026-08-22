/**
 * A ChatGPT-style desktop app, rendered natively on the GPU.
 *
 * Everything here is real GPUIX: the sidebar, the scrolling transcript, the
 * composer, and the `<markdown>`, `<code>` and `<diff>` blocks inside assistant
 * turns. Data is hardcoded.
 *
 * Two details worth copying into your own app:
 *
 * 1. **Chrome sets `userSelect: 'none'`.** The sidebar, top bar and composer opt
 *    out, so dragging across the transcript selects message text and never a
 *    conversation title. Content keeps the default.
 * 2. **The transcript is one scroll container** with a centred fixed-width
 *    column inside it, the same shape ChatGPT uses. `<diff>` gets an explicit
 *    height because it virtualizes internally and needs a bounded viewport.
 *
 * Run with:  cd examples && bun run chat
 */

import React, { useMemo, useState } from 'react'
import {
  createRoot,
  createRenderer,
  flushSync,
  startFrameLoop,
  type StyleDesc,
} from '@gpuix/react'
import { SafeMdxRenderer } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'

// ── Palette (ChatGPT dark) ───────────────────────────────────────────

const C = {
  sidebar: '#171717',
  canvas: '#212121',
  raised: '#303030',
  hover: '#ffffff0d',
  hoverStrong: '#ffffff14',
  border: '#ffffff1a',
  text: '#ececec',
  muted: '#b4b4b4',
  faint: '#8f8f8f',
  onAccent: '#0d0d0d',
  accent: '#ffffff',
}

/** Native text components read colours and layout numbers from this. */
const CHAT_THEME = {
  text: C.text,
  textMuted: C.muted,
  textFaint: C.faint,
  textDim: C.muted,
  border: C.border,
  bg: C.canvas,
  accent: '#7c86ff',
  metrics: {
    mdTextSize: 15,
    mdLineHeight: 26,
    mdBlockGap: 16,
    mdHeadingSizes: [22, 18, 16, 15],
    mdHeadingLineHeights: [30, 26, 24, 24],
    codeTextSize: 12.5,
    codeLineHeight: 20,
    codeRadius: 16,
    codeHeaderTextSize: 12,
    diffLineHeight: 20,
    diffFileHeaderHeight: 34,
  },
}

// ── Fake data ────────────────────────────────────────────────────────

interface Conversation {
  id: string
  title: string
  group: string
}

const CONVERSATIONS: Conversation[] = [
  { id: 'c1', title: 'Port selection from Comet', group: 'Today' },
  { id: 'c2', title: 'Tree-sitter grammar bundle size', group: 'Today' },
  { id: 'c3', title: 'Why is my flexbox column collapsing', group: 'Today' },
  { id: 'c4', title: 'napi-rs ThreadsafeFunction patterns', group: 'Yesterday' },
  { id: 'c5', title: 'Metal shader toolchain on Xcode 26', group: 'Yesterday' },
  { id: 'c6', title: 'Virtualized list scroll anchoring', group: 'Yesterday' },
  { id: 'c7', title: 'Rust oklch to sRGB conversion', group: 'Previous 7 days' },
  { id: 'c8', title: 'Cmd+C in a GPUI window', group: 'Previous 7 days' },
  { id: 'c9', title: 'React reconciler mutation protocol', group: 'Previous 7 days' },
  { id: 'c10', title: 'Debouncing a file watcher', group: 'Previous 7 days' },
  { id: 'c11', title: 'Bounded LRU for parsed documents', group: 'Previous 30 days' },
  { id: 'c12', title: 'Winit event loop on the main thread', group: 'Previous 30 days' },
  { id: 'c13', title: 'Comparing wgpu and Metal backends', group: 'Previous 30 days' },
]

type Turn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; markdown: string; code?: CodeBlock; diff?: string }

interface CodeBlock {
  language: string
  source: string
}

const ANSWER_1 = `Text selection in GPUI is not built in, so it has to be rebuilt from the
paint pass. Here is the shape of it.

**The problem.** Zed's markdown selects continuously because its whole document
is *one* element over one text model. A React renderer produces a **tree** of
small text elements, so a drag that crosses a paragraph boundary has nothing to
resolve against.

**The fix.** Every painted text element registers itself into a per-frame
registry during paint. Paint order is document order, so a drag anchored in one
element resolves into per-element byte spans: partial in the anchor and head,
whole for everything between.`

const ANSWER_1_CODE: CodeBlock = {
  language: 'rust',
  source: `pub fn resolve_spans(
    elements: &[(&str, &str)],
    a: (usize, usize),
    b: (usize, usize),
) -> Vec<Span> {
    let (start, end) = if a <= b { (a, b) } else { (b, a) };
    let mut spans = Vec::new();
    for (ei, (key, text)) in elements.iter().enumerate().take(end.0 + 1).skip(start.0) {
        let from = if ei == start.0 { start.1 } else { 0 };
        let to = if ei == end.0 { end.1 } else { text.len() };
        if from < to {
            spans.push(Span { key: key.to_string(), range: from..to, text: text.to_string() });
        }
    }
    spans
}`,
}

const ANSWER_2 = `Done. The gutter is now sized from the file's largest line number instead of a
fixed 36px, so a four-digit line no longer touches the accent bar.

| Change | Before | After |
|:-------|-------:|------:|
| Gutter at 3 digits | 36px | 36px |
| Gutter at 5 digits | 36px | 47px |
| Reflow on highlight | yes | no |

The width is computed analytically, so the code column never shifts while the
list scrolls. Highlighting only recolours runs; it never changes a font, which
is what keeps a late highlight from reflowing the block.`

const ANSWER_2_DIFF = [
  'diff --git a/packages/native/src/diff/mod.rs b/packages/native/src/diff/mod.rs',
  'index 8f2a1c4..d91b7e0 100644',
  '--- a/packages/native/src/diff/mod.rs',
  '+++ b/packages/native/src/diff/mod.rs',
  '@@ -78,12 +78,15 @@ impl FileDiff {',
  ' /// Width of one line-number gutter, fitted to the largest line number.',
  '-pub fn gutter_width(file: &FileDiff) -> f32 {',
  '-    GUTTER_WIDTH',
  '+pub fn gutter_width(file: &FileDiff, metrics: &Metrics) -> f32 {',
  '+    let digits = file.max_line.max(1).ilog10() + 1;',
  '+    (digits as f32 * 6.6 + 8.0 + 6.0).max(metrics.diff_gutter_width)',
  ' }',
  ' ',
  ' impl DiffRow {',
  '-    pub fn height(&self) -> f32 {',
  '+    pub fn height(&self, metrics: &Metrics) -> f32 {',
  '         match self {',
  '-            DiffRow::Line { .. } => DIFF_LINE_HEIGHT,',
  '+            DiffRow::Line { .. } => metrics.diff_line_height,',
  '         }',
  '     }',
  ' }',
].join('\n')

const ANSWER_3 = `Short version: **no**, and it is worth knowing why.

- \`require()\` of a \`.node\` file calls \`process.dlopen\`. Node has no matching unload.
- The event loop, GPU device, open window and selection registry all live in
  thread-locals of the loaded library. A second load gets empty ones.
- napi registers the module once per process.

So the loop rebuilds and restarts. An incremental build is about **two seconds**,
which is fast enough that the restart is not the bottleneck. Design numbers avoid
the rebuild entirely because they travel in a theme prop.`

const SAFE_MDX_STRESS = `# React-composed Markdown

This message uses **safe-mdx**, *styled spans*, ~~deleted text~~, an
\`inline code value\`, and [a link](https://github.com/holocron-hq/safe-mdx).

> The parser runs in TypeScript. Every Markdown node becomes a normal React
> component, then GPUIX renders the resulting \`div\`, \`text\`, and \`code\` tree.

- nested **inline formatting** inside a list
- a second item with a long sentence that must wrap without leaving the transcript column
- [x] a GFM task item

| Path | Renderer | Native Markdown element |
|:-----|:---------|:------------------------|
| safe-mdx | React tree | no |
| pulldown-cmark | Rust tree | yes |

\`\`\`typescript
const tree = mdxParse(source)
return <SafeMdxRenderer markdown={source} mdast={tree} />
\`\`\`

<Callout title="Custom MDX component">
  MDX components also map to ordinary GPUIX React components.
</Callout>`

const TURNS: Turn[] = [
  {
    role: 'user',
    text: 'How does cross-element text selection work in a GPUI app? I have a tree of text elements, not one big document.',
  },
  { role: 'assistant', markdown: ANSWER_1, code: ANSWER_1_CODE },
  { role: 'user', text: 'Nice. Now make the diff gutter width adapt to the largest line number.' },
  { role: 'assistant', markdown: ANSWER_2, diff: ANSWER_2_DIFF },
  { role: 'user', text: 'Do I get hot reload when I edit the Rust side?' },
  { role: 'assistant', markdown: ANSWER_3 },
]

// ── Sidebar ──────────────────────────────────────────────────────────

/**
 * A fixed 20x20 box that centres a glyph both ways.
 *
 * Glyphs have wildly different ink extents ("+" is short, "◇" is tall), so a
 * bare `<text>` next to a label puts every icon on its own baseline. Centring
 * inside a square of the label's line height lines them all up.
 */
function IconBox({ glyph, color }: { glyph: string; color: string }) {
  return (
    <div
      style={{
        width: 20,
        height: 20,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <text style={{ fontSize: 14, lineHeight: 20, color }}>{glyph}</text>
    </div>
  )
}

function SidebarButton({
  glyph,
  label,
  onClick,
}: {
  glyph: string
  label: string
  onClick?: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 36,
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: 10,
        cursor: 'pointer',
        hover: { backgroundColor: C.hover },
      }}
      onClick={onClick}
    >
      <IconBox glyph={glyph} color={C.text} />
      <text style={{ fontSize: 14, lineHeight: 20, color: C.text }}>{label}</text>
    </div>
  )
}

function ConversationRow({
  conversation,
  active,
  onSelect,
}: {
  conversation: Conversation
  active: boolean
  onSelect: (id: string) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        height: 34,
        // 10 + the 20px icon box + the 10px gap, so titles line up with the
        // labels of the buttons above them.
        paddingLeft: 40,
        paddingRight: 10,
        borderRadius: 10,
        cursor: 'pointer',
        backgroundColor: active ? C.hoverStrong : '#00000000',
        hover: { backgroundColor: C.hover },
      }}
      onClick={() => onSelect(conversation.id)}
    >
      <text
        style={{
          fontSize: 13.5,
          color: active ? C.text : C.muted,
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
      >
        {conversation.title}
      </text>
    </div>
  )
}

function Sidebar({
  activeId,
  onSelect,
  onCollapse,
}: {
  activeId: string
  onSelect: (id: string) => void
  onCollapse: () => void
}) {
  // Group headers are derived, so adding a conversation needs no extra wiring.
  const groups = useMemo(() => {
    const out: { name: string; items: Conversation[] }[] = []
    for (const conversation of CONVERSATIONS) {
      const last = out[out.length - 1]
      if (last && last.name === conversation.group) last.items.push(conversation)
      else out.push({ name: conversation.group, items: [conversation] })
    }
    return out
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 260,
        flexShrink: 0,
        height: '100%',
        backgroundColor: C.sidebar,
        // Chrome never starts a text drag.
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 52,
          paddingLeft: 12,
          paddingRight: 12,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: C.text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <text style={{ fontSize: 13, fontWeight: 'bold', color: C.onAccent }}>G</text>
        </div>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            hover: { backgroundColor: C.hover },
          }}
          onClick={onCollapse}
        >
          <text style={{ fontSize: 15, color: C.muted }}>‹</text>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: 8, paddingRight: 8 }}>
        <SidebarButton glyph="+" label="New chat" />
        <SidebarButton glyph="○" label="Search chats" />
        <SidebarButton glyph="◇" label="Library" />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          minHeight: 0,
          overflowY: 'scroll',
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 12,
        }}
      >
        {groups.map((group) => (
          <div
            key={group.name}
            style={{ display: 'flex', flexDirection: 'column', paddingBottom: 6 }}
          >
            <text
              style={{
                fontSize: 12,
                color: C.faint,
                paddingLeft: 40,
                paddingTop: 16,
                paddingBottom: 6,
              }}
            >
              {group.name}
            </text>
            {group.items.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeId}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </div>

      {/* GPUIX has no per-side border props, so dividers are 1px divs. */}
      <div style={{ height: 1, backgroundColor: C.border, flexShrink: 0 }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          height: 56,
          flexShrink: 0,
          paddingLeft: 10,
          paddingRight: 10,
          margin: 6,
          borderRadius: 12,
          cursor: 'pointer',
          hover: { backgroundColor: C.hover },
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: '#7c86ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <text style={{ fontSize: 12, fontWeight: 'bold', color: C.onAccent }}>T</text>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <text style={{ fontSize: 13.5, color: C.text }}>Tommy</text>
          <text style={{ fontSize: 11.5, color: C.faint }}>Pro plan</text>
        </div>
      </div>
    </div>
  )
}

// ── Transcript ───────────────────────────────────────────────────────

function UserTurn({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end' }}>
      <div
        style={{
          maxWidth: '76%',
          backgroundColor: C.raised,
          borderRadius: 24,
          paddingTop: 11,
          paddingBottom: 11,
          paddingLeft: 18,
          paddingRight: 18,
        }}
      >
        <text style={{ fontSize: 15, lineHeight: 24, color: C.text }}>{text}</text>
      </div>
    </div>
  )
}

/**
 * A copy icon drawn from two rounded squares.
 *
 * GPUIX has no icon element yet, and the unicode glyphs for "copy" render
 * inconsistently across system fonts. Two 10px rounded boxes, one outlined and
 * offset behind the other, read unmistakably and scale with the theme.
 */
function CopyGlyph({ color }: { color: string }) {
  return (
    <div style={{ position: 'relative', width: 14, height: 14 }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 10,
          height: 10,
          borderRadius: 3,
          borderWidth: 1.25,
          borderColor: color,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 4,
          top: 4,
          width: 10,
          height: 10,
          borderRadius: 3,
          borderWidth: 1.25,
          borderColor: color,
          backgroundColor: C.canvas,
        }}
      />
    </div>
  )
}

/** A ghost button: icon, optional label, rounded, washes on hover. */
function GhostButton({
  glyph,
  icon,
  label,
  active,
  onClick,
}: {
  glyph?: string
  icon?: React.ReactNode
  label?: string
  active?: boolean
  onClick?: () => void
}) {
  const color = active ? C.text : C.faint
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 30,
        paddingLeft: label ? 9 : 0,
        paddingRight: label ? 11 : 0,
        width: label ? undefined : 30,
        justifyContent: 'center',
        borderRadius: 10,
        cursor: 'pointer',
        backgroundColor: active ? C.hoverStrong : '#00000000',
        hover: { backgroundColor: C.hover },
      }}
      onClick={onClick}
    >
      {icon}
      {glyph && <text style={{ fontSize: 14, color }}>{glyph}</text>}
      {label && <text style={{ fontSize: 12.5, color }}>{label}</text>}
    </div>
  )
}

function ActionBar() {
  // Local state makes the row feel alive instead of decorative.
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState(false)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingTop: 6,
        marginLeft: -7,
        userSelect: 'none',
      }}
    >
      <GhostButton
        icon={copied ? undefined : <CopyGlyph color={C.faint} />}
        glyph={copied ? '✓' : undefined}
        active={copied}
        onClick={() => setCopied((was) => !was)}
      />
      <GhostButton glyph="↻" />
      {/* One positive signal rather than a thumbs pair: the outlined heart and
          its filled twin read unambiguously, where two abstract glyphs for
          up and down do not. */}
      <GhostButton
        glyph={liked ? '♥' : '♡'}
        active={liked}
        onClick={() => setLiked((was) => !was)}
      />
      <GhostButton glyph="↗" />
      <GhostButton glyph="⋯" />
    </div>
  )
}

function AssistantTurn({ turn }: { turn: Extract<Turn, { role: 'assistant' }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <markdown source={turn.markdown} theme={CHAT_THEME} />
      {turn.code && (
        <code
          code={turn.code.source}
          language={turn.code.language}
          showLineNumbers
          theme={CHAT_THEME}
        />
      )}
      {turn.diff && (
        // The radius sits on `<diff>` itself, not on a wrapper: GPUI clips a
        // scroll container to its bounds rectangle rather than to a rounded
        // path, so a rounded parent with overflow:hidden would still show
        // square corners underneath.
        <diff
          patch={turn.diff}
          wordDiff
          theme={CHAT_THEME}
          style={{
            // It virtualizes internally, so it needs a bounded viewport.
            height: 260,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: C.border,
            overflow: 'hidden',
          }}
        />
      )}
      <ActionBar />
    </div>
  )
}

type MdxChildren = { children?: React.ReactNode }

function MdxBlock({ children }: MdxChildren) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {children}
    </div>
  )
}

function MdxInline({
  children,
  style,
}: MdxChildren & { style?: StyleDesc }) {
  return <text style={{ fontSize: 15, lineHeight: 26, color: C.text, ...style }}>{children}</text>
}

/** Deliberately composes Markdown from host elements to expose missing web-style text flow. */
const SAFE_MDX_COMPONENTS = {
  h1: ({ children }: MdxChildren) => (
    <text style={{ fontSize: 22, lineHeight: 30, fontWeight: 700, color: C.text }}>{children}</text>
  ),
  h2: ({ children }: MdxChildren) => (
    <text style={{ fontSize: 18, lineHeight: 26, fontWeight: 700, color: C.text }}>{children}</text>
  ),
  h3: ({ children }: MdxChildren) => (
    <text style={{ fontSize: 16, lineHeight: 24, fontWeight: 700, color: C.text }}>{children}</text>
  ),
  h4: MdxInline,
  h5: MdxInline,
  h6: MdxInline,
  p: ({ children }: MdxChildren) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'start',
        width: '100%',
        fontSize: 15,
        lineHeight: 26,
        color: C.text,
      }}
    >
      {children}
    </div>
  ),
  blockquote: ({ children }: MdxChildren) => (
    <div style={{ display: 'flex', flexDirection: 'row', gap: 12, width: '100%' }}>
      <div style={{ width: 3, flexShrink: 0, backgroundColor: CHAT_THEME.accent }} />
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, color: C.muted }}>
        {children}
      </div>
    </div>
  ),
  hr: () => <div style={{ height: 1, width: '100%', backgroundColor: C.border }} />,
  ul: MdxBlock,
  ol: MdxBlock,
  li: ({ children }: MdxChildren) => (
    <div style={{ display: 'flex', flexDirection: 'row', gap: 9, width: '100%' }}>
      <text style={{ fontSize: 15, lineHeight: 26, color: C.muted }}>•</text>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>{children}</div>
    </div>
  ),
  strong: ({ children }: MdxChildren) => <MdxInline style={{ fontWeight: 700 }}>{children}</MdxInline>,
  em: ({ children }: MdxChildren) => <MdxInline style={{ color: C.muted }}>{children}</MdxInline>,
  del: ({ children }: MdxChildren) => <MdxInline style={{ color: C.faint }}>{children}</MdxInline>,
  code: ({ children }: MdxChildren) => (
    <MdxInline
      style={{
        fontFamily: 'Menlo',
        fontSize: 13,
        backgroundColor: C.raised,
        borderRadius: 5,
        paddingLeft: 5,
        paddingRight: 5,
      }}
    >
      {children}
    </MdxInline>
  ),
  a: ({ children }: MdxChildren & { href?: string }) => (
    <MdxInline style={{ color: CHAT_THEME.accent }}>{children}</MdxInline>
  ),
  table: ({ children }: MdxChildren) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  ),
  thead: MdxBlock,
  tbody: MdxBlock,
  tr: ({ children }: MdxChildren) => (
    <div style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>{children}</div>
  ),
  td: ({ children }: MdxChildren) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        flexGrow: 1,
        width: '33%',
        minWidth: 0,
        padding: 8,
        borderWidth: 1,
        borderColor: C.border,
        fontSize: 15,
        lineHeight: 26,
        color: C.text,
      }}
    >
      {children}
    </div>
  ),
  Callout: ({ children, title }: MdxChildren & { title?: string }) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        width: '100%',
        padding: 12,
        backgroundColor: C.raised,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: C.border,
      }}
    >
      <text style={{ fontSize: 13, fontWeight: 700, color: CHAT_THEME.accent }}>{title}</text>
      {children}
    </div>
  ),
}

function SafeMdxContent({ source }: { source: string }) {
  const mdast = useMemo(() => mdxParse(source), [source])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      <SafeMdxRenderer
        markdown={source}
        mdast={mdast}
        components={SAFE_MDX_COMPONENTS}
        renderNode={(node) => {
          if (node.type !== 'code') return undefined
          return (
            <code
              code={node.value}
              language={node.lang ?? undefined}
              showLineNumbers
              theme={CHAT_THEME}
            />
          )
        }}
      />
    </div>
  )
}

export function SafeMdxTranscript() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30, width: 748 }}>
      <UserTurn text="Can Markdown be composed as normal React elements instead?" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SafeMdxContent source={SAFE_MDX_STRESS} />
        <ActionBar />
      </div>
    </div>
  )
}

function Transcript() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        minHeight: 0,
        overflowY: 'scroll',
      }}
    >
      {/* Centred fixed-width column, the shape ChatGPT uses. */}
      <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: 748,
            gap: 30,
            paddingTop: 26,
            paddingBottom: 40,
            paddingLeft: 12,
            paddingRight: 12,
          }}
        >
          {TURNS.map((turn, ix) =>
            turn.role === 'user' ? (
              <UserTurn key={ix} text={turn.text} />
            ) : (
              <AssistantTurn key={ix} turn={turn} />
            )
          )}
          <SafeMdxTranscript />
        </div>
      </div>
    </div>
  )
}

// ── Chrome ───────────────────────────────────────────────────────────

function TopBar({
  collapsed,
  onExpand,
  title,
}: {
  collapsed: boolean
  onExpand: () => void
  title: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 52,
        flexShrink: 0,
        paddingLeft: 12,
        paddingRight: 12,
        userSelect: 'none',
      }}
    >
      {collapsed && (
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            hover: { backgroundColor: C.hover },
          }}
          onClick={onExpand}
        >
          <text style={{ fontSize: 15, color: C.muted }}>›</text>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: 32,
          paddingLeft: 10,
          paddingRight: 10,
          borderRadius: 8,
          cursor: 'pointer',
          hover: { backgroundColor: C.hover },
        }}
      >
        <text style={{ fontSize: 15, color: C.text }}>GPUIX</text>
        <text style={{ fontSize: 11, color: C.faint }}>▾</text>
      </div>
      <div style={{ flexGrow: 1 }} />
      <text
        style={{
          fontSize: 12.5,
          color: C.muted,
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          maxWidth: 280,
        }}
      >
        {title}
      </text>
    </div>
  )
}

function Composer({
  value,
  onChange,
  onSend,
}: {
  value: string
  onChange: (next: string) => void
  onSend: () => void
}) {
  const ready = value.trim().length > 0
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flexShrink: 0,
        paddingBottom: 16,
        paddingLeft: 12,
        paddingRight: 12,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', width: 748, gap: 8 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: C.raised,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: C.border,
            paddingTop: 14,
            paddingBottom: 8,
            paddingLeft: 12,
            paddingRight: 10,
          }}
        >
          <textarea
            value={value}
            placeholder="Ask anything"
            minRows={1}
            maxRows={8}
            autoFocus
            style={{
              width: '100%',
              minWidth: 0,
              fontSize: 15.5,
              lineHeight: 22,
              color: C.text,
              backgroundColor: '#00000000',
              borderWidth: 0,
              paddingLeft: 8,
              paddingRight: 8,
            }}
            onChange={(event) => onChange(event.value ?? '')}
            onSubmit={() => ready && onSend()}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingTop: 6,
            }}
          >
            <RoundButton glyph="+" />
            <ComposerPill glyph="◇" label="Tools" />
            <div style={{ flexGrow: 1 }} />
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                backgroundColor: ready ? C.accent : '#ffffff1f',
                hover: { backgroundColor: ready ? '#e8e8e8' : '#ffffff2b' },
              }}
              onClick={() => ready && onSend()}
            >
              <text
                style={{
                  fontSize: 16,
                  fontWeight: 'bold',
                  color: ready ? C.onAccent : C.faint,
                }}
              >
                {'↑'}
              </text>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center' }}>
          <text style={{ fontSize: 11.5, color: C.faint }}>
            GPUIX renders this window on the GPU. No web view.
          </text>
        </div>
      </div>
    </div>
  )
}

/** A 38px circular ghost button, matching the send button. */
function RoundButton({ glyph }: { glyph: string }) {
  return (
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        hover: { backgroundColor: C.hoverStrong },
      }}
    >
      <text style={{ fontSize: 16, color: C.muted }}>{glyph}</text>
    </div>
  )
}

/** An outlined pill for the composer's tool switches. */
function ComposerPill({ glyph, label }: { glyph: string; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 34,
        paddingLeft: 12,
        paddingRight: 14,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: C.border,
        cursor: 'pointer',
        hover: { backgroundColor: C.hoverStrong },
      }}
    >
      <text style={{ fontSize: 13, color: C.muted }}>{glyph}</text>
      <text style={{ fontSize: 13, color: C.muted }}>{label}</text>
    </div>
  )
}

// ── App ──────────────────────────────────────────────────────────────

export function ChatApp() {
  const [activeId, setActiveId] = useState('c1')
  const [collapsed, setCollapsed] = useState(false)
  const [draft, setDraft] = useState('')

  const title = CONVERSATIONS.find((c) => c.id === activeId)?.title ?? ''

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        backgroundColor: C.canvas,
        fontFamily: 'Helvetica',
      }}
    >
      {!collapsed && (
        <Sidebar
          activeId={activeId}
          onSelect={setActiveId}
          onCollapse={() => setCollapsed(true)}
        />
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          minWidth: 0,
          height: '100%',
        }}
      >
        <TopBar collapsed={collapsed} onExpand={() => setCollapsed(false)} title={title} />
        <Transcript />
        <Composer value={draft} onChange={setDraft} onSend={() => setDraft('')} />
      </div>
    </div>
  )
}

async function main() {
  const renderer = createRenderer(() => {})

  renderer.init({
    title: 'GPUIX Chat',
    width: 1180,
    height: 820,
  })

  const root = createRoot(renderer)
  flushSync(() => root.render(<ChatApp />))

  console.log('[GPUIX] Chat running')
  startFrameLoop(renderer)
}

// Only run main() when this file is the entry point, so tests can import ChatApp.
const isEntryPoint =
  typeof Bun !== 'undefined'
    ? Bun.main === import.meta.path
    : process.argv[1]?.endsWith('chat.tsx')

if (isEntryPoint) {
  main().catch(console.error)
}
