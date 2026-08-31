export interface ThemeBgTokens {
  app: string;
  panel: string;
  panelAlt: string;
  input: string;
  selected: string;
  selectedAlt: string;
  highlight: string;
  codeBlock: string;
  codeBlockHeader: string;
  badge: string;
  badgeActive: string;
  aiBanner: string;
  aiBannerSelected: string;
  aiPrompt: string;
  aiProposal: string;
  buttonPrimary: string;
  buttonSecondary: string;
  buttonDanger: string;
  buttonSuccess: string;
  buttonAi: string;
}

export interface ThemeBorderTokens {
  subtle: string;
  default: string;
  strong: string;
  focus: string;
  info: string;
  ai: string;
  aiDeep: string;
  success: string;
  error: string;
}

export interface ThemeTextTokens {
  primary: string;
  secondary: string;
  muted: string;
  dim: string;
  faint: string;
  inverse: string;
  highlight: string;
  warning: string;
  success: string;
  error: string;
  ai: string;
  link: string;
}

export interface ThemeAccentTokens {
  primary: string;
  primaryLight: string;
  secondary: string;
  cyan: string;
  purple: string;
  purpleDark: string;
  purpleLight: string;
  green: string;
  greenDark: string;
  red: string;
  redDark: string;
  yellow: string;
  blue: string;
  blueDark: string;
}

export interface ThemeStatusTokens {
  todo: string;
  inProgress: string;
  urgent: string;
  question: string;
  paused: string;
  cancelled?: string;
  done: string;
  priorityHigh: string;
  priorityMedium: string;
  priorityLow: string;
}

export interface ThemeSyntaxTokens {
  h1: string;
  h2: string;
  h3: string;
  h4: string;
  bold: string;
  italic: string;
  code: string;
  codeBg: string;
  link: string;
  list: string;
  quote: string;
  table: string;
  keyword: string;
  string: string;
  stringSpecial: string;
  number: string;
  comment: string;
  constant: string;
  function: string;
  type: string;
  tag: string;
  attribute: string;
  parameter: string;
  punctuation: string;
  default: string;
}

export interface Theme {
  id: string;
  name: string;
  displayName: string;
  isDark: boolean;
  bg: ThemeBgTokens;
  border: ThemeBorderTokens;
  text: ThemeTextTokens;
  accent: ThemeAccentTokens;
  status: ThemeStatusTokens;
  syntax: ThemeSyntaxTokens;
}
