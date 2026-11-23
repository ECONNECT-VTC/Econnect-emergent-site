import translations from '@/translations';
import { PRIVATE_TRANSLATIONS } from './dashboardTranslations';

const originalText = new WeakMap();
const originalAttributes = new WeakMap();
const ignoredTags = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE']);

const phraseMap = (language) => {
  const result = new Map();
  const publicTranslations = translations[language] || translations.fr;
  Object.keys(translations.fr || {}).forEach((key) => {
    if (translations.fr[key] && publicTranslations?.[key]) {
      result.set(translations.fr[key], publicTranslations[key]);
    }
  });
  const privateTranslations = PRIVATE_TRANSLATIONS[language] || PRIVATE_TRANSLATIONS.en;
  Object.keys(PRIVATE_TRANSLATIONS.fr || {}).forEach((key) => {
    const target = privateTranslations?.[key] || PRIVATE_TRANSLATIONS.en?.[key];
    if (PRIVATE_TRANSLATIONS.fr[key] && target) {
      result.set(PRIVATE_TRANSLATIONS.fr[key], target);
    }
  });
  return result;
};

const translateValue = (value, dictionary) => {
  const leading = value.match(/^\s*/)?.[0] || '';
  const trailing = value.match(/\s*$/)?.[0] || '';
  const content = value.trim();
  if (!content) return value;
  if (dictionary.has(content)) return `${leading}${dictionary.get(content)}${trailing}`;
  let translated = content;
  [...dictionary.entries()]
    .filter(([source]) => source.length >= 2)
    .sort(([left], [right]) => right.length - left.length)
    .forEach(([source, target]) => {
      translated = translated.split(source).join(target);
    });
  return `${leading}${translated}${trailing}`;
};

const translateNode = (node, dictionary) => {
  if (node.nodeType === Node.TEXT_NODE) {
    const previous = originalText.get(node);
    const state = !previous || node.nodeValue !== previous.rendered
      ? { source: node.nodeValue, rendered: node.nodeValue }
      : previous;
    const translated = translateValue(state.source, dictionary);
    state.rendered = translated;
    originalText.set(node, state);
    if (node.nodeValue !== translated) node.nodeValue = translated;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || ignoredTags.has(node.tagName)) return;
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    if (!originalAttributes.has(node)) originalAttributes.set(node, new Map());
    const saved = originalAttributes.get(node);
    ['placeholder', 'title', 'aria-label'].forEach((attribute) => {
      if (!node.hasAttribute(attribute)) return;
      const current = node.getAttribute(attribute);
      const previous = saved.get(attribute);
      const state = !previous || current !== previous.rendered
        ? { source: current, rendered: current }
        : previous;
      const translated = translateValue(state.source, dictionary);
      state.rendered = translated;
      saved.set(attribute, state);
      if (node.getAttribute(attribute) !== translated) node.setAttribute(attribute, translated);
    });
  } else {
    if (!originalAttributes.has(node)) originalAttributes.set(node, new Map());
    const saved = originalAttributes.get(node);
    ['title', 'aria-label'].forEach((attribute) => {
      if (!node.hasAttribute(attribute)) return;
      const current = node.getAttribute(attribute);
      const previous = saved.get(attribute);
      const state = !previous || current !== previous.rendered
        ? { source: current, rendered: current }
        : previous;
      const translated = translateValue(state.source, dictionary);
      state.rendered = translated;
      saved.set(attribute, state);
      if (node.getAttribute(attribute) !== translated) node.setAttribute(attribute, translated);
    });
  }
  node.childNodes.forEach((child) => translateNode(child, dictionary));
};

export const startPageTranslation = (language) => {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  const dictionary = phraseMap(language);
  translateNode(document.body, dictionary);
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => translateNode(node, dictionary));
      if (mutation.type === 'characterData') translateNode(mutation.target, dictionary);
      if (mutation.type === 'attributes') translateNode(mutation.target, dictionary);
    });
  });
  observer.observe(document.body, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'],
  });
  return () => observer.disconnect();
};
