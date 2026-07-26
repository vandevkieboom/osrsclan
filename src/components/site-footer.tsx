import { Link } from "react-router-dom";
import { DISCORD_URL, RUNEPROFILE_URL, WOM_GROUP_URL } from "../data/links";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="site-footer-mark">Time Served</span>
          <span className="site-footer-tag">Old School RuneScape clan</span>
        </div>

        <nav className="site-footer-nav">
          <Link to="/rankings">Rankings</Link>
          <Link to="/hiscores">Hiscores</Link>
          <Link to="/activity">Activity</Link>
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
            Discord
          </a>
          <a href={WOM_GROUP_URL} target="_blank" rel="noopener noreferrer">
            Wise Old Man
          </a>
          <a href={RUNEPROFILE_URL} target="_blank" rel="noopener noreferrer">
            RuneProfile
          </a>
        </nav>

        <p className="site-footer-credit">
          Hero artwork by Magenixy. Not affiliated with Jagex Ltd.
        </p>
      </div>
    </footer>
  );
}
