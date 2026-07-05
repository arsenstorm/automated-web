/** Credit line rendered once at the app root, below the page crossfade. */

export function Footer() {
  return (
    <footer className="mt-auto pt-4 text-center text-muted-foreground text-xs">
      Built with care by{" "}
      <a
        className="underline underline-offset-2 hover:text-foreground"
        href="http://arsenstorm.com"
        rel="noopener"
        target="_blank"
      >
        Arsen Shkrumelyak
      </a>
    </footer>
  );
}
