const Footer = () => (
  <footer className="border-t border-border py-12">
    <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
      <div className="flex items-center gap-4">
        <span>© 2026 AuthHero. Open source under MIT.</span>
      </div>
      <div className="flex gap-6">
        <a href="https://github.com/markusahlstrand/authhero" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
        <a href="https://docs.authhero.net" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Docs</a>
      </div>
    </div>
  </footer>
);

export default Footer;
