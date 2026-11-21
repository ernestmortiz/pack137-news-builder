/**
 * Content model (build spec, section 7.3). The typed form that pasted HTML is reduced to.
 * Only this model reaches the UI and the renderer; pasted markup never does.
 */

/** Inline emphasis carried over from the pasted HTML. `b` maps to strong, `i` to em. */
export type Mark = 'strong' | 'em' | 'strike';

/** A run of text with the same marks and, when inside a link, the same destination. */
export interface TextRun {
  kind: 'text';
  text: string;
  /** Sorted, de-duplicated. */
  marks: Mark[];
  /** Present when the run sits inside a link. Already passed the URL allow-list. */
  href?: string;
}

/** A `<br>` inside a paragraph or list item. */
export interface LineBreak {
  kind: 'break';
}

export type Inline = TextRun | LineBreak;

export interface HeadingBlock {
  type: 'heading';
  /** 1 to 6 from a heading tag; inferred headings are level 3. */
  level: 1 | 2 | 3 | 4 | 5 | 6;
  runs: Inline[];
  /** `tag` came from h1 to h6; `inferred` from the bold or unpunctuated line rule. */
  source: 'tag' | 'inferred';
}

export interface ParagraphBlock {
  type: 'paragraph';
  runs: Inline[];
}

export interface ListItem {
  runs: Inline[];
  /** Nested lists inside the item, flattened one level deep by extract. */
  children: ListBlock[];
}

export interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: ListItem[];
}

export interface ImageBlock {
  type: 'image';
  src: string;
  /** Empty string when the source had none; a warning is raised. */
  alt: string;
  width?: number;
  height?: number;
  /** Set when the image was wrapped in a link. */
  href?: string;
}

export interface RuleBlock {
  type: 'rule';
}

export type Block = HeadingBlock | ParagraphBlock | ListBlock | ImageBlock | RuleBlock;

export interface ContentModel {
  blocks: Block[];
}

/** Things the pipeline noticed. None of them block the user (section 7.4). */
export type IssueCode =
  /** A link or image used `http:`. Kept, not upgraded. */
  | 'insecure-url'
  /** A link or image URL failed the allow-list and was removed. */
  | 'blocked-url'
  /** A link with no destination, or a bare domain such as `meet.google.com/...`. */
  | 'link-no-destination'
  /** Script, style, iframe, object, form or similar was dropped. */
  | 'dropped-element'
  | 'image-no-alt';

export interface Issue {
  code: IssueCode;
  message: string;
  /** The offending URL or tag name, for display beside the field. */
  detail?: string;
}

export type Layout = 'message' | 'call-to-action' | 'link-list' | 'date-list' | 'help-wanted';
