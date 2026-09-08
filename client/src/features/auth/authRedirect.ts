export function getSafeRedirectTarget(value: string | null): string | null {
    const hasControlCharacter = value
        ? Array.from(value).some((character) => {
              const codePoint = character.charCodeAt(0);
              return codePoint <= 0x1f || codePoint === 0x7f;
          })
        : false;

    if (
        !value ||
        !value.startsWith("/") ||
        value.startsWith("//") ||
        value.includes("\\") ||
        hasControlCharacter
    ) {
        return null;
    }

    return value;
}
