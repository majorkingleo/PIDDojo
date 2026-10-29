// ---------------------------------------------------------------------------
// CodeMirror 6 editor for the controller formula.
// ---------------------------------------------------------------------------

import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';

export class CodeEditor {
  private readonly view: EditorView;
  private readonly theme = new Compartment();

  constructor(
    parent: HTMLElement,
    initial: string,
    private readonly onChange: (value: string) => void,
  ) {
    const state = EditorState.create({
      doc: initial,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
        javascript(),
        this.theme.of(oneDark),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) this.onChange(update.state.doc.toString());
        }),
      ],
    });

    this.view = new EditorView({ state, parent });
  }

  getValue(): string {
    return this.view.state.doc.toString();
  }

  setValue(value: string): void {
    const current = this.getValue();
    if (current === value) return;
    this.view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }

  /** Insert `text` at the cursor (replacing the selection) and focus the editor. */
  insertText(text: string): void {
    const { state } = this.view;
    this.view.dispatch(state.replaceSelection(text));
    this.view.focus();
  }

  setTheme(light: boolean): void {
    this.view.dispatch({
      effects: this.theme.reconfigure(light ? [] : oneDark),
    });
  }

  focus(): void {
    this.view.focus();
  }
}
