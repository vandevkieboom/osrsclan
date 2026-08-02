import { GITHUB_URL, RUNEPROFILE_URL, WOM_GROUP_URL } from "../data/links";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="site-footer-mark">Time Served</span>
          <span className="site-footer-tag">Old School RuneScape clan</span>
        </div>

        <nav className="site-footer-nav">
          <a href={WOM_GROUP_URL} target="_blank" rel="noopener noreferrer">
            Wise Old Man
          </a>
          <a href={RUNEPROFILE_URL} target="_blank" rel="noopener noreferrer">
            RuneProfile
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            Solo Nostalg
          </a>
        </nav>
      </div>
    </footer>
  );
}
