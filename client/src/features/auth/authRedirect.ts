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

export type InternalLocation = {
    pathname: string;
    search: string;
    hash: string;
};

export function buildLoginRedirectPath(location: InternalLocation): string {
    const target = `${location.pathname || "/"}${location.search || ""}${location.hash || ""}`;
    return `/login?redirect=${encodeURIComponent(target)}`;
}
