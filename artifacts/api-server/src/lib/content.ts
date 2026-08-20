const ARTICLE_LANGUAGES = [
  "Czech", "Danish", "Dutch", "English", "Finnish", "French", "German",
  "Hungarian", "Italian", "Japanese", "Korean", "Norwegian", "Polish",
  "Portuguese", "Russian", "Spanish", "Swedish", "Turkish", "Chinese",
];

const LANGUAGE_PATTERN = ARTICLE_LANGUAGES.join("|");

export function cleanContent(value: string): string {
  return value
    .replace(new RegExp(`View Article in\\s*(?:(?:${LANGUAGE_PATTERN})\\s*)+`, "gi"), "")
    .replace(/(?:^|\n)\s*SUMMARY\s*\n\s*DETAILS\s*\n/gi, "\n")
    .replace(/\s*Is this article helpful\?\s*Yes\s*No\s*$/i, "")
    .replace(/\s*ASSOCIATED COMPONENTS\s*\n[\s\S]*$/i, "")
    .replace(/(?:^|\n)\s*CONTENTS\s*\n\s*Details\s*\n\s*Summary\s*\n/gi, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}