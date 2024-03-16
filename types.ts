export type TextNodeRef = HTMLSpanElement | HTMLDivElement;

export interface ITextLine {
  styles: OneOfStyles[];
  nodes: ITextNode[];
}

export interface IRenderedNode {
  ref: TextNodeRef;
  parent: IRenderedTextLine;
}

// export type StyleValues = `${number}px` | `#${string}`;

export const AllowedStyles = ['fontSize', 'color', 'font-weight'] as const;

type AllowedStyle = typeof AllowedStyles[number];

export interface IStyle<Rule extends AllowedStyle, StyleValue extends string> {
  style: Rule;
  value: StyleValue;
}

export interface IFontSizeStyle extends IStyle<'fontSize', `${number}px`> {}
export interface IColorStyle extends IStyle<'color', `#${string}`> {}
export interface IFontWeightStyle extends IStyle<'font-weight', 'bold'> {}

export type OneOfStyles = IFontSizeStyle | IColorStyle | IFontWeightStyle;

export interface ITextNode {
  text: string;
  type: 'content' | 'END';
  styles: OneOfStyles[];
}

export interface IText {
  lines: ITextLine[];
  styles: OneOfStyles[];
}

export interface IRenderedTextNode extends ITextNode, IRenderedNode {}

export interface IRenderedTextLine
  extends ITextLine,
    Omit<IRenderedNode, 'parent'> {
  nodes: IRenderedTextNode[];
}

export interface IRenderedText {
  lines: IRenderedTextLine[];
  styles: OneOfStyles[];
}

export type NodeType = 'text' | 'line';

export type NodeSelection = {
  nodeIndex: number;
  lineIndex: number;
  position: number;
  node: ITextNode;
};

export type ModelSelection = {
  anchorNode: NodeSelection;
  focusNode: NodeSelection;
  nodesBetween: ITextNode[];
};

export type HistorySnapshot = {
  selection: ModelSelection;
  model: IText;
};
