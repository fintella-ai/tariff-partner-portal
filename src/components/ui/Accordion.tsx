"use client";

import { useState, useCallback } from "react";

/**
 * Represents a single item within an Accordion.
 */
export interface AccordionItem {
  /** Unique identifier for the item (used as React key and state tracking). */
  id: string;
  /** Header text displayed in the clickable toggle. */
  title: string;
  /** Body text shown when the item is expanded. */
  content: string;
}

/**
 * Props for the Accordion component.
 */
interface AccordionProps {
  /** Array of accordion items to render. */
  items: AccordionItem[];
  /**
   * When true, multiple items can be open simultaneously.
   * When false (default), opening one item closes all others.
   */
  allowMultiple?: boolean;
}

/**
 * A collapsible accordion component for FAQ-style content. Each item can be
 * toggled independently (when `allowMultiple` is true) or in exclusive mode
 * where only one item is open at a time (default).
 *
 * Items animate open/closed using a max-height transition for a smooth effect.
 *
 * @example
 * ```tsx
 * const faqItems: AccordionItem[] = [
 *   { id: "1", title: "What is TRLN?", content: "TRLN is..." },
 *   { id: "2", title: "How do I sign up?", content: "Visit..." },
 * ];
 *
 * <Accordion items={faqItems} />
 * <Accordion items={faqItems} allowMultiple />
 * ```
 */
export default function Accordion({
  items,
  allowMultiple = false,
}: AccordionProps) {
  /** Set of currently-expanded item IDs. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  /**
   * Toggle an item's expanded state. In single-item mode, opening a new item
   * closes all others.
   */
  const toggle = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);

        if (next.has(id)) {
          // Collapse this item.
          next.delete(id);
        } else {
          // In exclusive mode, close everything else first.
          if (!allowMultiple) {
            next.clear();
          }
          next.add(id);
        }

        return next;
      });
    },
    [allowMultiple]
  );

  return (
    <div role="list">
      {items.map((item) => {
        const isOpen = expanded.has(item.id);

        return (
          <div
            key={item.id}
            role="listitem"
            className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl mb-2"
          >
            {/* Header — clickable toggle */}
            <button
              onClick={() => toggle(item.id)}
              className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-[var(--app-card-bg)] rounded-xl transition-colors cursor-pointer"
              aria-expanded={isOpen}
              aria-controls={`accordion-content-${item.id}`}
            >
              <span className="font-body text-sm font-medium text-[var(--app-text)] text-left">
                {item.title}
              </span>

              {/* Chevron indicator — rotates 180deg when expanded */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`shrink-0 ml-3 text-[var(--app-text-muted)] transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {/* Content area — animated via max-height transition */}
            <div
              id={`accordion-content-${item.id}`}
              className="overflow-hidden transition-all duration-300 ease-in-out"
              style={{ maxHeight: isOpen ? "500px" : "0px" }}
              role="region"
              aria-labelledby={`accordion-header-${item.id}`}
            >
              <div className="border-t border-[var(--app-border)] px-4 sm:px-5 pb-4 pt-3">
                <p className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed">
                  {item.content}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
