import Link from "next/link";
import { GaugeIcon, ImportIcon, SpeechIcon } from "./icons";

export function SiteHeader() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <SpeechIcon size={16} />
          </span>
          Aloud
        </Link>
        <nav>
          <Link href="/teacher/new">
            <SpeechIcon size={15} />
            Set up a session
          </Link>
          <Link href="/teacher/import">
            <ImportIcon size={15} />
            Import from Classroom
          </Link>
          <Link href="/#your-results">
            <GaugeIcon size={15} />
            Your results
          </Link>
        </nav>
      </div>
    </header>
  );
}
