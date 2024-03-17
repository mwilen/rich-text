// Import stylesheets
import './style.css';
import {
    AllowedStyles,
    HistorySnapshot,
    IRenderedText,
    IRenderedTextLine,
    IRenderedTextNode,
    IStyle,
    IText,
    ITextLine,
    ITextNode,
    ModelSelection,
    NodeSelection,
    OneOfStyles,
    TextNodeRef,
} from './types';
import { deepEqual } from './utils';

const richTextData: IText = {
    lines: [
        {
            nodes: [
                {
                    text: 'Hello',
                    type: 'content',
                    styles: [
                        {
                            style: 'color',
                            value: '#f00',
                        },
                    ],
                },
                {
                    text: ' ',
                    type: 'content',
                    styles: [],
                },
                {
                    text: 'World!',
                    type: 'content',
                    styles: [
                        {
                            style: 'color',
                            value: '#00f',
                        },
                        {
                            style: 'fontSize',
                            value: '15px',
                        },
                    ],
                },
            ],
            styles: [
                {
                    style: 'fontSize',
                    value: '25px',
                },
            ],
        },
        {
            nodes: [
                {
                    text: 'Lorem',
                    type: 'content',
                    styles: [
                        {
                            style: 'color',
                            value: '#f00',
                        },
                    ],
                },
                {
                    text: ' ',
                    type: 'content',
                    styles: [],
                },
                {
                    text: 'Ipsum!',
                    type: 'content',
                    styles: [
                        {
                            style: 'color',
                            value: '#00f',
                        },
                        {
                            style: 'fontSize',
                            value: '15px',
                        },
                        {
                            style: 'fontWeight',
                            value: 'bold',
                        },
                    ],
                },
            ],
            styles: [
                {
                    style: 'fontSize',
                    value: '25px',
                },
            ],
        },
    ],
    styles: [],
};

class RichText {
    #richTextAnchor!: HTMLElement;
    #renderedRichText!: IRenderedText;
    #textModel!: IText;
    get #selection(): Selection {
        return document.getSelection()!;
    }
    #history: { undo: HistorySnapshot[]; redo: HistorySnapshot[] } = {
        undo: [],
        redo: [],
    };

    constructor(text: IText, anchor?: HTMLElement | null) {
        if (!anchor) {
            throw new Error('No anchor provided.')
        }

        this.init(anchor);
        this.renderText(text);
    }

    private init(anchor: HTMLElement): void {
        this.#richTextAnchor = anchor;

        const mutationObserver = new MutationObserver((mutation) => {
            const childMutations = mutation.filter(({ type }) => type === 'characterData');

            for (const childMutation of childMutations) {
                if (childMutation) {
                    // this.onTextMutation();
                }
            }
        });

        mutationObserver.observe(this.#richTextAnchor, {
            subtree: true,
            characterData: true,
            childList: true,
        });

        this.#richTextAnchor.addEventListener('mouseup', (e) => {
            console.log(this.#selection);
        });

        this.#richTextAnchor.addEventListener('keydown', (event: KeyboardEvent) => {
            console.log(event);
            if (this.isUndoKey(event)) {
                this.undoState();
                event.preventDefault();
                return;
            }

            if (this.isRedoKey(event)) {
                this.redoState();
                event.preventDefault();
                return;
            }

            if (this.isBoldCommand(event)) {
                event.preventDefault();
                this.toggleBold();
                return;
            }
        });

        this.#richTextAnchor.addEventListener('beforeinput', (event) => {
            this.addUndo();
            console.log('this.addUndo', this.#history);
        });

        this.#richTextAnchor.addEventListener('paste', (event) => {
            event.preventDefault();

            let pasteValue = (event.clipboardData || (window as any).clipboardData).getData('text');

            this.onPaste(pasteValue);
        });
    }

    private onPaste(pasteValue: string): void {
        const selection = this.#selection;

        if (!selection.rangeCount) {
            return;
        }

        const selectionRange = selection.getRangeAt(0);
        const { startContainer, endContainer } = selectionRange;

        if (!startContainer.parentElement || !endContainer.parentElement) {
            return;
        }

        const startLine = startContainer.parentElement.parentElement;
        const endLine = endContainer.parentElement.parentElement;
        const newTextSpan = document.createElement('span');
        newTextSpan.textContent = pasteValue;

        const startContainerStyles = this.getStylesFromDomElement(startContainer.parentElement);

        for (const styleItem in startContainerStyles) {
            const { style, value } = startContainerStyles[styleItem];
            newTextSpan.style[style] = value;
        }

        selection.deleteFromDocument();

        const newTextNode = document.createTextNode(pasteValue);
        const isRangeBetweenDifferentContainers = startLine !== endLine;

        if (isRangeBetweenDifferentContainers) {
            selectionRange.selectNode(startContainer);
            selectionRange.collapse();
        }

        selectionRange.insertNode(newTextNode);

        if (isRangeBetweenDifferentContainers) {
            selectionRange.selectNode(endContainer);
            const clonedNode = selectionRange.endContainer.parentNode!.cloneNode(true);
            const movedLineFragment = document.createDocumentFragment();
            const getLineStyles = this.getStylesFromDomElement(clonedNode as TextNodeRef);

            // Pass down line styles
            for (const node of clonedNode.childNodes) {
                for (const styleItem of getLineStyles) {
                    const { style, value } = styleItem;
                    (node as TextNodeRef).style[style] = value;
                }
            }

            movedLineFragment.append(...clonedNode.childNodes);

            selectionRange.selectNode(startLine?.lastChild!);
            const clonedRange = selectionRange.cloneRange();
            selectionRange.collapse();
            selectionRange.insertNode(movedLineFragment);
            selectionRange.selectNode(startLine?.nextElementSibling!);
            selection.deleteFromDocument();
            selection.removeAllRanges();
            selection.addRange(clonedRange);
            selection.collapseToEnd();
        }

        this.onTextMutation();
    }

    private onTextMutation(): void {
        // const selection = this.#selection;
        // const range = selection.getRangeAt(0);

        this.#textModel = this.getTextModel();

        // setTimeout(() => {
        this.#renderedRichText = this.domToRenderedText();
        console.log(
            'this.getRenderedTextNodeAtCaretPosition',
            this.getRenderedTextNodeAtFocusPosition()
        );
        // });
    }

    private undoState(): void {
        const undoState = this.#history.undo.at(-1);
        if (!undoState) {
            return;
        }
        const { model, selection } = undoState;

        this.addRedo();
        this.#history.undo.splice(-1);
        this.renderText(model);
        console.log(this.#history);

        this.setCaretPosition(selection);
    }

    private redoState(): void {
        const redoState = this.#history.redo.at(-1);
        if (!redoState) {
            return;
        }
        const { model, selection } = redoState;

        this.addUndo();
        this.#history.redo.splice(-1);
        this.renderText(model);
        console.log(this.#history);

        this.setCaretPosition(selection);
    }

    private addUndo(): void {
        this.#history.undo.push({
            selection: this.getModelSelection(),
            model: structuredClone(this.#textModel),
        });
        console.log(this.#history);
    }

    private addRedo(): void {
        this.#history.redo.push({
            selection: structuredClone(this.#history.undo.at(-1)!.selection),
            model: structuredClone(this.#textModel),
        });
        console.log(this.#history);
    }

    private toggleBold(): void {
        this.addUndo();
        const selection = this.#selection;
        const range = selection.getRangeAt(0);
        const clonedRange = selection.getRangeAt(0);
        console.log('toggle bold');

        const selectionElement = range.cloneContents();
        const commonAncestor = range.commonAncestorContainer!;
        const selectionContent = selectionElement.textContent!;
        const selectionNode = range.startContainer.parentElement!;
        const clonedSelectionNode = selectionNode.cloneNode(true);
        const currentSelection = this.getModelSelection();
        const nodesBetween = currentSelection.nodesBetween;
        const fullNodeSelection =
            commonAncestor instanceof Text &&
            commonAncestor.textContent?.length === selectionContent.length;

        let isTextNodeSelection = false;
        console.log(currentSelection, this.getRenderedTextNodeAtFocusPosition());

        const [start, end] = [currentSelection.anchorNode, currentSelection.focusNode].sort((a, b) => {
            if (a.lineIndex !== b.lineIndex) {
                return a.lineIndex - b.lineIndex;
            }

            if (a.nodeIndex !== b.nodeIndex) {
                return a.nodeIndex - b.nodeIndex;
            }

            if (a.position !== b.position) {
                return a.position - b.position;
            }

            return 0;
        });

        const withinSameNode = start.node === end.node;
        const withinSameLine = start.lineIndex === end.lineIndex;

        const startBefore = start.node.text.slice(0, start.position);
        const startAfter =
            withinSameNode && withinSameLine
                ? start.node.text.slice(start.position, end.position)
                : start.node.text.slice(start.position, start.node.text.length);
        const endBefore = !withinSameNode ? end.node.text.slice(0, end.position) : undefined;
        const endAfter = end.node.text.slice(end.position, end.node.text.length);

        console.log(startBefore, startAfter, endBefore, endAfter);

        let nodeOffset = 0;

        selection.deleteFromDocument();
        const textModel = this.domToTextModel();

        if (startBefore) {
            textModel.lines[start.lineIndex].nodes[start.nodeIndex].text = startBefore;
            nodeOffset += 1;
        }

        const newStartNodes: ITextNode[] = [];
        const newEndNodes: ITextNode[] = [];
        const modifiedNodes: ITextNode[] = [...nodesBetween];

        const startAfterNode: ITextNode = {
            styles: [...structuredClone(start.node.styles)],
            text: startAfter,
            type: 'content',
        };

        newStartNodes.push(startAfterNode, ...nodesBetween);
        modifiedNodes.push(startAfterNode);

        if (endBefore) {
            const endBeforeNode: ITextNode = {
                styles: [...structuredClone(end.node.styles)],
                text: endBefore,
                type: 'content',
            };
            newEndNodes.push(endBeforeNode);
            modifiedNodes.push(endBeforeNode);
        }

        if (endAfter && startBefore && withinSameNode) {
            const endAfterNode: ITextNode = {
                styles: structuredClone(end.node.styles),
                text: endAfter,
                type: 'content',
            };

            newEndNodes.push(endAfterNode);
        }

        for (const node of modifiedNodes) {
            const styleAtIndex = node.styles.findIndex(({ style }) => style === 'fontWeight');
            if (styleAtIndex !== -1) {
                node.styles.splice(styleAtIndex, 1);
            } else {
                node.styles.push({ style: 'fontWeight', value: 'bold' });
            }
        }

        textModel.lines[start.lineIndex].nodes.splice(
            start.nodeIndex + nodeOffset,
            0,
            ...newStartNodes
        );

        const endPosition = withinSameLine ? newStartNodes.length + nodeOffset + start.nodeIndex : 0;
        textModel.lines[end.lineIndex].nodes.splice(endPosition, 0, ...newEndNodes);

        this.renderText(textModel);

        const currentAnchor = start;
        const currentFocus = end;
        const newFocusNode = newEndNodes.at(-1)!;

        const anchorNode: NodeSelection = {
            ...currentAnchor,
            node: startAfterNode,
            nodeIndex: currentAnchor.nodeIndex + nodeOffset,
            position: 0,
        };

        const focusNode: NodeSelection = {
            ...currentFocus,
            node: newFocusNode,
            nodeIndex: endPosition,
            position: withinSameNode ? startAfterNode.text.length : newFocusNode.text.length,
        };

        this.setCaretPosition({
            ...currentSelection,
            anchorNode,
            focusNode,
        });

        console.log(this.#textModel.lines[start.lineIndex]);

        return;
    }

    private getRenderedTextNodeAtFocusPosition(): IRenderedTextNode | undefined {
        const focusNode = this.#selection.focusNode!;

        for (const line of this.#renderedRichText.lines) {
            for (const node of line.nodes) {
                if (node.ref === focusNode.parentElement) {
                    return node;
                }
            }
        }
    }

    private getRenderedTextNodeAtAnchorPosition(): IRenderedTextNode | undefined {
        const anchorNode = this.#selection.anchorNode!;

        for (const line of this.#renderedRichText.lines) {
            for (const node of line.nodes) {
                if (node.ref === anchorNode.parentElement) {
                    return node;
                }
            }
        }
    }

    private getModelSelection(): ModelSelection {
        const nodeAtSelectionAnchor = this.getRenderedTextNodeAtAnchorPosition();
        const nodeAtSelectionFocus = this.getRenderedTextNodeAtFocusPosition();

        if (!nodeAtSelectionAnchor || !nodeAtSelectionFocus) {
            throw new Error('No node within selection');
        }

        const textLines = this.#textModel.lines;
        const renderedTextLines = this.#renderedRichText.lines;
        const { anchorOffset, focusOffset } = this.#selection;

        const modelSelection = {
            nodesBetween: [],
        } as unknown as ModelSelection;

        for (let lineIndex = 0; lineIndex < textLines.length; lineIndex++) {
            const line = textLines[lineIndex];
            const renderedLine = renderedTextLines[lineIndex];

            for (let nodeIndex = 0; nodeIndex < line.nodes.length; nodeIndex++) {
                const node = line.nodes[nodeIndex];
                const renderedNode = renderedLine.nodes[nodeIndex];

                const isNodeAtAnchor = renderedNode.ref === nodeAtSelectionAnchor.ref;
                const isNodeAtFocus = renderedNode.ref === nodeAtSelectionFocus.ref;

                if (isNodeAtAnchor) {
                    modelSelection.anchorNode = {
                        nodeIndex,
                        lineIndex,
                        position: anchorOffset,
                        node,
                    };
                }

                if (isNodeAtFocus) {
                    modelSelection.focusNode = {
                        nodeIndex,
                        lineIndex,
                        position: focusOffset,
                        node,
                    };
                }

                if (
                    (modelSelection.anchorNode || modelSelection.focusNode) &&
                    !isNodeAtAnchor &&
                    !isNodeAtFocus
                ) {
                    modelSelection.nodesBetween.push(node);
                }

                if (modelSelection.focusNode && modelSelection.anchorNode) {
                    return modelSelection;
                }
            }
        }

        throw new Error('Could not create selection model');
    }

    private parseDomToTextModel(): IText {
        const textModel: IText = {
            lines: [],
            styles: [],
        };

        for (const child of this.#richTextAnchor.children) {
            if (child instanceof HTMLDivElement) {
                const textLine: ITextLine = {
                    nodes: [],
                    styles: this.getStylesFromDomElement(child),
                };

                for (let i = 0; i < child.childNodes.length; i++) {
                    const node = child.childNodes[i];
                    if (node instanceof HTMLSpanElement) {
                        const styles = this.getStylesFromDomElement(node);
                        const previousNode =
                            textLine.nodes.length > 0 ? textLine.nodes.at(-1) : undefined;
                        if (previousNode && deepEqual(styles, previousNode.styles)) {
                            previousNode.text += node.textContent;
                        } else {
                            textLine.nodes.push({
                                styles,
                                text: node.textContent!,
                                type: 'content',
                            });
                        }
                    } else if (node instanceof Text) {
                        const span = document.createElement('span');
                        span.textContent = node.textContent;
                        const parentStyles = this.getStylesFromDomElement(node.parentElement!);
                        this.applyStyles(span, parentStyles);

                        textLine.nodes.push({
                            styles: parentStyles,
                            text: span.textContent!,
                            type: 'content',
                        });
                    }
                }

                textModel.lines.push(textLine);
            }
        }

        return textModel;
    }

    private domToRenderedText(): IRenderedText {
        const textModel: IRenderedText = {
            lines: [],
            styles: [],
        };

        for (const child of this.#richTextAnchor.children) {
            if (child instanceof HTMLDivElement) {
                const textLine: IRenderedTextLine = {
                    nodes: [],
                    ref: child,
                    styles: this.getStylesFromDomElement(child),
                };

                for (let i = 0; i < child.childNodes.length; i++) {
                    const node = child.childNodes[i];
                    const textContent = node.textContent ?? '';

                    if (textContent.length === 0) {
                        continue;
                    }

                    if (node instanceof HTMLSpanElement) {
                        const styles = this.getStylesFromDomElement(node);
                        const previousNode =
                            textLine.nodes.length > 0 ? textLine.nodes.at(-1) : undefined;
                        if (previousNode && deepEqual(styles, previousNode.styles)) {
                            previousNode.text += textContent;
                        } else {
                            textLine.nodes.push({
                                parent: textLine,
                                ref: node,
                                styles,
                                text: textContent,
                                type: 'content',
                            });
                        }
                    } else if (node instanceof Text) {
                        const span = document.createElement('span');
                        span.textContent = node.textContent;

                        textLine.nodes.push({
                            parent: textLine,
                            ref: span,
                            styles: [],
                            text: span.textContent!,
                            type: 'content',
                        });
                    }
                }

                textModel.lines.push(textLine);
            }
        }

        return textModel;
    }

    private domToTextModel(mergeSimilarSiblings = false): IText {
        const textModel: IText = {
            lines: [],
            styles: [],
        };

        for (const child of this.#richTextAnchor.children) {
            if (child instanceof HTMLDivElement) {
                const textLine: ITextLine = {
                    nodes: [],
                    styles: this.getStylesFromDomElement(child),
                };

                for (let i = 0; i < child.childNodes.length; i++) {
                    const node = child.childNodes[i];
                    const textContent = node.textContent ?? '';

                    if (textContent.length === 0) {
                        continue;
                    }

                    if (node instanceof HTMLSpanElement) {
                        const styles = this.getStylesFromDomElement(node);
                        const previousNode =
                            textLine.nodes.length > 0 ? textLine.nodes.at(-1) : undefined;

                        if (
                            mergeSimilarSiblings &&
                            previousNode &&
                            deepEqual(styles, previousNode.styles)
                        ) {
                            previousNode.text += textContent;
                        } else {
                            textLine.nodes.push({
                                styles,
                                text: textContent,
                                type: 'content',
                            });
                        }
                    } else if (node instanceof Text) {
                        const span = document.createElement('span');
                        span.textContent = textContent;

                        textLine.nodes.push({
                            styles: [],
                            text: span.textContent,
                            type: 'content',
                        });
                    }
                }

                textModel.lines.push(textLine);
            }
        }

        return textModel;
    }

    private getStylesFromDomElement(element: TextNodeRef): OneOfStyles[] {
        const styles: OneOfStyles[] = [];

        if (!this.isSpanOrDivElement(element)) {
            return [];
        }

        for (const style of AllowedStyles) {
            const styleValue = element.style[style] as OneOfStyles['value'];
            if (styleValue) {
                styles.push({
                    style,
                    value: styleValue as any,
                });
            }
        }

        return styles;
    }

    private isSpanOrDivElement(element: TextNodeRef): element is Exclude<TextNodeRef, Text> {
        return element instanceof HTMLDivElement || element instanceof HTMLSpanElement;
    }

    private setCaretPosition(modelSelection: ModelSelection): void {
        const { anchorNode, focusNode } = modelSelection;

        const anchorLine = this.#renderedRichText.lines[anchorNode.lineIndex];
        const nodeAtAnchor = anchorLine.nodes[anchorNode.nodeIndex];

        const focusLine = this.#renderedRichText.lines[focusNode.lineIndex];
        const nodeAtFocus = focusLine.nodes[focusNode.nodeIndex];

        if (!nodeAtAnchor || !nodeAtFocus) {
            return;
        }

        var selection = this.#selection;

        selection.removeAllRanges();
        selection.setBaseAndExtent(
            nodeAtAnchor.ref.childNodes[0],
            anchorNode.position,
            nodeAtFocus.ref.childNodes[0],
            focusNode.position
        );
    }

    private isUndoKey(event: KeyboardEvent): boolean {
        return this.getKey(event) === 'z' && this.isCtrlOrMeta(event);
    }

    private isRedoKey(event: KeyboardEvent): boolean {
        return this.getKey(event) === 'y' && this.isCtrlOrMeta(event);
    }

    private isCtrlOrMeta(event: KeyboardEvent): boolean {
        return event.ctrlKey || event.metaKey;
    }

    private isBoldCommand(event: KeyboardEvent): boolean {
        return this.isCtrlOrMeta(event) && this.getKey(event) === 'b';
    }

    private getKey(event: KeyboardEvent): string {
        return event.key.toLowerCase();
    }

    getTextModel(): IText {
        return this.parseDomToTextModel();
    }

    private renderText(text: IText): void {
        this.#textModel = text;

        const fragment = document.createDocumentFragment();
        const wrapper = document.createElement('div');
        this.applyStyles(wrapper, text.styles);
        const newRenderedText: IRenderedText = {
            lines: [],
            styles: text.styles,
        };

        for (const line of text.lines) {
            const lineDiv = document.createElement('div');
            this.applyStyles(lineDiv, line.styles);
            const newRenderedTextLine: IRenderedTextLine = {
                nodes: [],
                ref: lineDiv,
                styles: line.styles,
            };

            for (const node of line.nodes) {
                const span = document.createElement('span');
                span.textContent = node.text;
                this.applyStyles(span, node.styles);
                lineDiv.appendChild(span);
                const clonedNode = structuredClone(node) as IRenderedTextNode;
                newRenderedTextLine.nodes.push({
                    ...clonedNode,
                    ref: span,
                    parent: newRenderedTextLine,
                });
            }

            newRenderedText.lines.push(newRenderedTextLine);

            fragment.appendChild(lineDiv);
        }

        this.#richTextAnchor.innerHTML = '';
        this.#renderedRichText = newRenderedText;

        this.#richTextAnchor.appendChild(fragment);

        this.resizeText();
    }

    private applyStyles(span: HTMLSpanElement | HTMLDivElement, styles: OneOfStyles[]): void {
        for (const style of styles) {
            const styleAttribute = style.style;
            span.style[styleAttribute] = style.value;
        }
    }

    private resizeText(): void {
        const offsetWidth = this.#richTextAnchor.offsetWidth;

        if (this.isTextWithinBounds(offsetWidth)) {
            return;
        }

        let iterations = 0;
        const pre = performance.now();

        while (!this.isTextWithinBounds(offsetWidth)) {
            let resized = false;
            iterations++;

            for (const line of this.#renderedRichText.lines) {
                for (const node of line.nodes) {
                    const boundingRect = node.ref.getBoundingClientRect();
                    if (!this.isNodeWithinBounds(node, offsetWidth)) {
                        const margin =
                            boundingRect.right / offsetWidth;
                        const fontSize = parseFloat(
                            line.ref.style.fontSize ?? this.#richTextAnchor.style.fontSize
                        );
                        const multiplier = margin > 1.05 ? 1.01 : 1.001;
                        console.log(margin);
                        this.applyStyleToAllLines({
                            style: 'fontSize',
                            value: `${fontSize / multiplier}px`,
                        });
                        resized = true;
                    }
                }
            }

            if (!resized) {
                return;
            }
        }

        const post = performance.now();
        
        console.log('performance', post-pre);
        console.log('iterations', iterations);
    }

    private isTextWithinBounds(offsetWidth: number): boolean {
        for (const line of this.#renderedRichText.lines) {
            for (const node of line.nodes) {
                if (!this.isNodeWithinBounds(node, offsetWidth)) {
                    return false
                }
            }
        }

        return true;
    }

    private isNodeWithinBounds(node: IRenderedTextNode, offsetWidth: number): boolean {
        if (node.ref.getBoundingClientRect().right > offsetWidth) {
            return false;
        }

        return true;
    }

    private applyStyleToAllLines(style: OneOfStyles): void {
        for (const line of this.#renderedRichText.lines) {
            line.ref.style[style.style] = style.value;
        }
    }
}

const richText = new RichText(richTextData, document.querySelector<HTMLElement>('#text'));

console.log(richText);

document.querySelector('#render')?.addEventListener('click', () => {
    const textModel = richText.getTextModel();
    new RichText(textModel, document.querySelector<HTMLElement>('#rendered-text'));
});
