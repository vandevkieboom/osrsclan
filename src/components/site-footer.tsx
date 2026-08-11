import { RUNEPROFILE_URL, WOM_GROUP_URL } from "../data/links";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="site-footer-mark">Time Served</span>
          <span className="site-footer-tag">Old School RuneScape clan</span>
        </div>

        <nav className="site-footer-nav">
          <a
            href="https://ko-fi.com/solonostalg"
            className="site-footer-support"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg
              className="site-footer-support-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
            </svg>
            Buy a Coffee for Solo Nostalg
          </a>
          <a href={WOM_GROUP_URL} target="_blank" rel="noopener noreferrer">
            Wise Old Man
          </a>
          <a href={RUNEPROFILE_URL} target="_blank" rel="noopener noreferrer">
            RuneProfile
          </a>
        </nav>
      </div>
    </footer>
  );
}
