import FadeIn from "./FadeIn";

const codeLines = [
  { indent: 0, content: 'import { init } from "authhero";' },
  { indent: 0, content: 'import createAdapters from "@authhero/kysely-adapter";' },
  { indent: 0, content: "" },
  { indent: 0, content: "const { oauthApp, managementApp } = init({" },
  { indent: 1, content: "dataAdapter: createAdapters(db)," },
  { indent: 0, content: "});" },
  { indent: 0, content: "" },
  { indent: 0, content: 'app.route("/", oauthApp);' },
  { indent: 0, content: 'app.route("/api/v2", managementApp);' },
];

const CodeWindow = () => (
  <FadeIn delay={0.3}>
    <div className="hairline rounded-lg overflow-hidden max-w-xl mx-auto">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/50">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-border" />
          <span className="w-2.5 h-2.5 rounded-full bg-border" />
          <span className="w-2.5 h-2.5 rounded-full bg-border" />
        </div>
        <span className="text-xs text-muted-foreground ml-2">auth.ts</span>
      </div>
      {/* Code */}
      <div className="p-5 font-mono text-sm leading-relaxed">
        {codeLines.map((line, i) => (
          <div key={i} style={{ paddingLeft: `${line.indent * 1.5}rem` }}>
            {line.content ? (
              <span className="text-foreground/80">{line.content}</span>
            ) : (
              <br />
            )}
          </div>
        ))}
      </div>
    </div>
  </FadeIn>
);

export default CodeWindow;
