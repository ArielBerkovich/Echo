import Typo from "typo-js";
import affData from "typo-js/dictionaries/en_US/en_US.aff?raw";
import wordsData from "typo-js/dictionaries/en_US/en_US.dic?raw";

const spell = new Typo("en_US", affData, wordsData);

self.onmessage = ({ data }) => {
  const { id, word } = data;
  const suggestions = spell.check(word) ? [] : spell.suggest(word);
  self.postMessage({ id, suggestions });
};
