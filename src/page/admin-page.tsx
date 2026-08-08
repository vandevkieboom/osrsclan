import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { AdminPanelTabs } from "../components/admin-panel-tabs";
import { useAuth } from "../context/auth-context";

export function AdminPage() {
  const { user, isAdmin, isLoading, login } = useAuth();

  if (isLoading) return null;

  if (!user || !isAdmin) {
    return (
      <>
        <SiteHeader />
        <div className="page">
          <div className="page-head">
            <div className="page-eyebrow">Staff</div>
            <h1 className="page-title">Admin Panel</h1>
            <p className="page-sub">Manage teams, members, the board, and the draft.</p>
          </div>
          <div className="bingo-admin-empty">
            {user ? (
              "You don't have access to this page."
            ) : (
              <>
                Log in with Discord to access the admin panel.
                <div className="bingo-login-prompt">
                  <button
                    type="button"
                    className="site-header-login"
                    onClick={() => login("/admin")}
                  >
                    Log in with Discord
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <div className="page">
        <div className="page-head">
          <div className="page-eyebrow">Staff</div>
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-sub">Manage teams, members, the board, and the draft.</p>
        </div>
        <AdminPanelTabs />
      </div>
      <SiteFooter />
    </>
  );
}
