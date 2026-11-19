/**
 * Atributos de teclado para os campos do velo.
 *
 * O Gboard e outros teclados só exibem a barra de sugestões e a correção
 * automática quando o campo não desliga esses recursos. Campos de texto livre
 * usam um destes conjuntos; campos técnicos (e-mail, senha, @handle, URL e
 * tags) mantêm a autocorreção desligada para não alterar o valor digitado.
 *
 * O `autoComplete` fica explícito em cada campo porque o valor ideal varia
 * (nome, e-mail, senha, URL, busca etc.) e repetir a mesma prop no spread
 * gera erro de JSX no TypeScript.
 */
export const SENTENCE_INPUT_PROPS = {
  autoCorrect: "on",
  autoCapitalize: "sentences",
  spellCheck: true,
} as const;

export const WORDS_INPUT_PROPS = {
  autoCorrect: "on",
  autoCapitalize: "words",
  spellCheck: true,
} as const;

export const SEARCH_INPUT_PROPS = {
  autoCorrect: "on",
  autoCapitalize: "none",
  spellCheck: true,
} as const;

export const TECHNICAL_INPUT_PROPS = {
  autoCorrect: "off",
  autoCapitalize: "none",
  spellCheck: false,
} as const;
