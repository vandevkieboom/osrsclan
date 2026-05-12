import { Link, useLocation } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/rankings", label: "Rankings" },
  { to: "/hiscores", label: "Hiscores" },
  { to: "/activity", label: "Activity" },
];

export function NavMenu() {
  const location = useLocation();

  return (
    <nav className="page-nav">
      <Link
        to="/"
        className={`page-nav-btn page-nav-home${location.pathname === "/" ? " active" : ""}`}
        title="Home"
        aria-label="Home"
      >
        <img
          src="https://oldschool.runescape.wiki/images/Lumbridge_Home_Teleport_icon_%28mobile%29.png"
          alt="Home"
          className="page-nav-home-icon"
        />
      </Link>

      {NAV_ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={`page-nav-btn${location.pathname === item.to ? " active" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
