import { memo, useMemo, useState } from "react";
import { ChevronRight, ListChecks, Network, Sparkles, Zap } from "lucide-react";
import { LazyMarkdown } from "@/components/LazyMarkdown";
import {
  parseRichContent,
  type MindMapNode,
  type QuizQuestion,
  type RevisionUnit,
  type RichBlock,
} from "@/utils/parseRichContent";

/** Memoised on `content` so unrelated turns stay idle while another is streaming. */
export const AssistantRichBody = memo(function AssistantRichBody({ content }: { content: string }) {
  const parsed = useMemo(() => parseRichContent(content), [content]);
  if (!parsed.text && parsed.blocks.length === 0) {
    return <LazyMarkdown>{content}</LazyMarkdown>;
  }
  return (
    <div className="flex flex-col gap-4">
      {parsed.text ? <LazyMarkdown>{parsed.text}</LazyMarkdown> : null}
      {parsed.blocks.map((block, index) => (
        <RichBlockCard key={`${block.type}-${index}`} block={block} />
      ))}
    </div>
  );
});

function RichBlockCard({ block }: { block: RichBlock }) {
  if (block.type === "unavailable") {
    return (
      <aside className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
        {block.message}
      </aside>
    );
  }
  if (block.type === "flashcards") {
    return <FlashCards title={block.title} cards={block.cards} />;
  }
  if (block.type === "quiz") {
    return <Quiz title={block.title} questions={block.questions} />;
  }
  if (block.type === "mindmap") {
    return <MindMap title={block.title} nodes={block.nodes} />;
  }
  return <QuickRevision title={block.title} units={block.units} />;
}

function BlockHeader({
  icon,
  title,
  meta,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-accent" aria-hidden="true">
          {icon}
        </span>
        <h3 className="truncate text-sm font-semibold">{title}</h3>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {meta ? <p className="text-xs text-fg-muted">{meta}</p> : null}
        {action}
      </div>
    </div>
  );
}

function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className="rich-collapse" data-open={open} aria-hidden={!open}>
      <div>{children}</div>
    </div>
  );
}

function FlashCards({ title, cards }: { title: string; cards: { front: string; back: string }[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[index];
  if (!card) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <BlockHeader
        icon={<Sparkles size={16} />}
        title={title}
        meta={`${index + 1} / ${cards.length}`}
      />
      <button
        type="button"
        className="mt-3 min-h-32 w-full rounded-xl border border-border bg-surface-muted px-4 py-6 text-left transition-colors hover:border-accent/60"
        onClick={() => setFlipped((value) => !value)}
      >
        <p className="text-xs font-semibold tracking-wide text-fg-muted">{flipped ? "Answer" : "Question"}</p>
        <div className="mt-2 text-sm">
          <LazyMarkdown>{flipped ? card.back : card.front}</LazyMarkdown>
        </div>
      </button>
      <div className="mt-3 flex justify-between">
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40"
          disabled={index === 0}
          onClick={() => {
            setIndex((value) => value - 1);
            setFlipped(false);
          }}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40"
          disabled={index === cards.length - 1}
          onClick={() => {
            setIndex((value) => value + 1);
            setFlipped(false);
          }}
        >
          Next
        </button>
      </div>
    </section>
  );
}

function Quiz({ title, questions }: { title: string; questions: QuizQuestion[] }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const letters = ["A", "B", "C", "D"];
  const answered = Object.keys(answers).length;
  const correct = questions.reduce(
    (total, question, index) => (answers[index] === question.correctIndex ? total + 1 : total),
    0,
  );

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <BlockHeader
        icon={<ListChecks size={16} />}
        title={title}
        meta={
          answered === questions.length
            ? `Score ${correct} / ${questions.length}`
            : `${answered} / ${questions.length} answered`
        }
      />
      <ol className="mt-3 space-y-5">
        {questions.map((question, questionIndex) => {
          const selected = answers[questionIndex];
          const isAnswered = selected !== undefined;
          return (
            <li key={question.question}>
              <div className="flex gap-2 text-sm font-medium">
                <span className="text-fg-muted">{questionIndex + 1}.</span>
                <div className="min-w-0 flex-1">
                  <LazyMarkdown>{question.question}</LazyMarkdown>
                </div>
              </div>
              <div className="mt-2 grid gap-2">
                {question.options.map((option, optionIndex) => {
                  const isSelected = selected === optionIndex;
                  const isCorrect = question.correctIndex === optionIndex;
                  const tone = !isAnswered
                    ? "border-border hover:border-accent/60"
                    : isCorrect
                      ? "border-accent bg-accent/10"
                      : isSelected
                        ? "border-danger bg-danger/10"
                        : "border-border";
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={isAnswered}
                      className={`flex gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${tone}`}
                      onClick={() => setAnswers((current) => ({ ...current, [questionIndex]: optionIndex }))}
                    >
                      <span className="font-semibold">{letters[optionIndex]}.</span>
                      <span className="min-w-0 flex-1">
                        <LazyMarkdown>{option}</LazyMarkdown>
                      </span>
                    </button>
                  );
                })}
              </div>
              {isAnswered && question.explanation ? (
                <div className="mt-2 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm text-fg-muted">
                  <LazyMarkdown>{question.explanation}</LazyMarkdown>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

type MindMapBranch = { title: string; children: MindMapNode[] };

function groupMindMapBranches(nodes: MindMapNode[]): { root: string | null; branches: MindMapBranch[] } {
  const root = nodes.find((node) => node.level === 0)?.text ?? null;
  const branches: MindMapBranch[] = [];
  for (const node of nodes) {
    if (node.level === 0) continue;
    const current = branches[branches.length - 1];
    if (node.level === 1 || !current) branches.push({ title: node.text, children: [] });
    else current.children.push(node);
  }
  return { root, branches };
}

function MindMap({ title, nodes }: { title: string; nodes: MindMapNode[] }) {
  const { root, branches } = useMemo(() => groupMindMapBranches(nodes), [nodes]);
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const allOpen = collapsed.length === 0;
  const leafCount = branches.reduce((total, branch) => total + branch.children.length, 0);

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <BlockHeader
        icon={<Network size={16} />}
        title={root ?? title}
        meta={`${branches.length} branches · ${leafCount} points`}
        action={
          branches.length > 0 ? (
            <button
              type="button"
              className="rounded-lg border border-border px-2.5 py-1 text-xs text-fg-muted transition-colors hover:text-fg"
              onClick={() => setCollapsed(allOpen ? branches.map((_, index) => index) : [])}
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          ) : undefined
        }
      />
      <ul className="mt-3 space-y-2">
        {branches.map((branch, index) => {
          const open = !collapsed.includes(index);
          const hasChildren = branch.children.length > 0;
          return (
            <li key={`${branch.title}-${index}`} className="rounded-xl border border-border bg-surface-muted">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium disabled:cursor-default"
                disabled={!hasChildren}
                aria-expanded={hasChildren ? open : undefined}
                onClick={() =>
                  setCollapsed((current) =>
                    current.includes(index)
                      ? current.filter((value) => value !== index)
                      : [...current, index],
                  )
                }
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">{branch.title}</span>
                {hasChildren ? (
                  <ChevronRight
                    size={16}
                    aria-hidden="true"
                    className={`shrink-0 text-fg-muted transition-transform ${open ? "rotate-90" : ""}`}
                  />
                ) : null}
              </button>
              {hasChildren ? (
                <Collapsible open={open}>
                  <ul className="space-y-1 px-3 pb-3 text-sm text-fg-muted">
                    {branch.children.map((child, childIndex) => (
                      <li
                        key={`${child.text}-${childIndex}`}
                        style={{ paddingLeft: `${Math.max(child.level - 1, 0) * 14}px` }}
                      >
                        <span className="mr-2 text-accent" aria-hidden="true">
                          ·
                        </span>
                        {child.text}
                      </li>
                    ))}
                  </ul>
                </Collapsible>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function QuickRevision({ title, units }: { title: string; units: RevisionUnit[] }) {
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const pointCount = units.reduce((total, unit) => total + unit.points.length, 0);

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <BlockHeader
        icon={<Zap size={16} />}
        title={title}
        meta={`${units.length} units · ${pointCount} points`}
      />
      <ul className="mt-3 space-y-2">
        {units.map((unit, index) => {
          const open = !collapsed.includes(index);
          return (
            <li key={`${unit.title}-${index}`} className="rounded-xl border border-border bg-surface-muted">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
                aria-expanded={open}
                onClick={() =>
                  setCollapsed((current) =>
                    current.includes(index)
                      ? current.filter((value) => value !== index)
                      : [...current, index],
                  )
                }
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">{unit.title}</span>
                <ChevronRight
                  size={16}
                  aria-hidden="true"
                  className={`shrink-0 text-fg-muted transition-transform ${open ? "rotate-90" : ""}`}
                />
              </button>
              <Collapsible open={open}>
                <ul className="list-disc space-y-1 px-3 pb-3 pl-8 text-sm text-fg-muted">
                  {unit.points.map((point, pointIndex) => (
                    <li key={`${point}-${pointIndex}`}>
                      <LazyMarkdown>{point}</LazyMarkdown>
                    </li>
                  ))}
                </ul>
              </Collapsible>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
