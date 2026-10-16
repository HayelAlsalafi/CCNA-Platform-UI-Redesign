import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth, useClerk, useUser } from "@clerk/react";
import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  useHealthCheck,
} from "@workspace/api-client-react";
import {
  BookOpen,
  ChevronUp,
  CircleGauge,
  ClipboardCheck,
  History,
  Layers3,
  LogIn,
  LogOut,
  Menu,
  Network,
  Settings,
  ShieldCheck,
  Target,
} from "lucide-react";
import { progressIdentity, sessionQueryKey } from "../lib/learning-progress-cache";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription } from "./ui/sheet";
import { adminModules } from "./admin-ui";

const learningLinks = [
  { href: "/", label: "Overview", icon: CircleGauge },
  { href: "/topics", label: "Curriculum", icon: Layers3 },
  { href: "/practice", label: "Practice", icon: Target },
  { href: "/exam", label: "Exam simulator", icon: ClipboardCheck },
  { href: "/practice/history", label: "Practice history", icon: History },
];
function useAccount() {
  const auth = useAuth(),
    identity = progressIdentity(auth);
  const query = useGetCurrentUser({
    query: {
      queryKey: sessionQueryKey(getGetCurrentUserQueryKey(), identity),
      enabled: Boolean(identity),
      retry: false,
      gcTime: 0,
    },
  });
  return { auth, identity, query };
}
export function AccountMenu({ basePath = "" }: { basePath?: string }) {
  const { auth, identity, query } = useAccount(),
    { user } = useUser(),
    { signOut, openUserProfile } = useClerk();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const actor = useRef("");
  actor.current = `${auth.userId ?? ""}:${auth.sessionId ?? ""}`;
  useEffect(() => {
    setBusy(false);
    setError("");
  }, [auth.userId, auth.sessionId]);
  if (!auth.isLoaded || (auth.isSignedIn && !identity))
    return (
      <div className="sidebar-account" role="status">
        Checking identity…
      </div>
    );
  if (!auth.isSignedIn)
    return (
      <div className="sidebar-account">
        <p>Save your learning progress.</p>
        <Link href="/sign-in" className="account-sign-in">
          <LogIn size={18} /> Sign in
        </Link>
      </div>
    );
  const verifiedUser = user?.id === auth.userId ? user : null;
  const name =
    verifiedUser?.fullName ||
    verifiedUser?.username ||
    query.data?.user.displayName ||
    "Signed-in learner";
  const role = query.isError ? "Role unavailable" : (query.data?.user.role ?? "Checking role");
  const initials =
    name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "U";
  return (
    <div className="sidebar-account" data-testid="panel-auth-state">
      <DropdownMenu key={identity?.sessionId}>
        <DropdownMenuTrigger asChild>
          <button
            className="account-trigger"
            type="button"
            disabled={busy}
            aria-label={`Open account menu for ${name}`}
          >
            <span className="account-avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="account-details">
              <strong>{name}</strong>
              <span>{role}</span>
            </span>
            <ChevronUp size={17} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="account-dropdown" align="start" side="top" sideOffset={10}>
          <DropdownMenuLabel>
            <strong>{name}</strong>
            <span className="account-menu-role">{role}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {verifiedUser && typeof openUserProfile === "function" && (
            <DropdownMenuItem
              onSelect={() => {
                setError("");
                try {
                  openUserProfile();
                } catch {
                  setError("Account settings could not open. Try again.");
                }
              }}
            >
              <Settings aria-hidden="true" /> Account settings
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            data-testid="button-sign-out"
            onSelect={() => {
              const captured = actor.current;
              setBusy(true);
              setError("");
              void signOut({ redirectUrl: `${basePath}/` })
                .catch(() => {
                  if (actor.current === captured) setError("Sign out failed. Please try again.");
                })
                .finally(() => {
                  if (actor.current === captured) setBusy(false);
                });
            }}
          >
            <LogOut aria-hidden="true" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {query.isError && (
        <p className="account-message">
          Could not load your role.{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="account-message">
          {error}
        </p>
      )}
    </div>
  );
}
function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation(),
    path = location.split("?")[0],
    { query } = useAccount();
  const isAdmin = query.data?.user.role === "ADMIN";
  return (
    <>
      <div className="side-kicker">Learn</div>
      <nav aria-label="Learning navigation">
        <ul className="nav-list">
          {learningLinks.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className={`nav-link ${path === href ? "active" : ""}`}
                aria-current={path === href ? "page" : undefined}
                onClick={onNavigate}
              >
                <Icon className="nav-icon" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="side-kicker admin-group-label">Administration</div>
      <nav aria-label="Administration navigation">
        <ul className="nav-list">
          {(isAdmin ? adminModules : [adminModules[0]]).map((m) => (
            <li key={m.href}>
              <Link
                href={m.href}
                className={`nav-link ${path === m.href ? "active" : ""}`}
                aria-current={path === m.href ? "page" : undefined}
                onClick={onNavigate}
              >
                <ShieldCheck className="nav-icon" aria-hidden="true" />
                <span>{!isAdmin ? "Admin access" : m.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-mark" aria-hidden="true">
        <Network />
      </span>
      <span>
        <span className="brand-name">CCNA Platform</span>
        <span className="brand-sub">Learn. Practice. Progress.</span>
      </span>
    </Link>
  );
}
export function ApplicationNavigation({ basePath = "" }: { basePath?: string }) {
  const [open, setOpen] = useState(false),
    health = useHealthCheck();
  const healthy = ["ok", "healthy"].includes(health.data?.status?.toLowerCase() ?? "");
  return (
    <>
      <a className="skip-navigation" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar modern-sidebar" aria-label="Primary navigation">
        <Brand />
        <NavigationLinks />
        <div className="sidebar-bottom">
          <div className="sidebar-service" role="status">
            <span
              className={`service-dot ${health.isError ? "error" : healthy ? "online" : "pending"}`}
            />
            {health.isPending
              ? "Checking service"
              : health.isError
                ? "Service unavailable"
                : healthy
                  ? "Service operational"
                  : "Service status unavailable"}
          </div>
          <AccountMenu basePath={basePath} />
        </div>
      </aside>
      <header className="mobile-top modern-mobile-top">
        <Link href="/" className="mobile-brand">
          <BookOpen aria-hidden="true" size={22} />
          CCNA Platform
        </Link>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button type="button" className="mobile-menu-trigger" aria-label="Open navigation menu">
              <Menu aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="navigation-drawer">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Learning and administration tools, followed by your account menu.
            </SheetDescription>
            <Brand />
            <NavigationLinks onNavigate={() => setOpen(false)} />
            <div className="sidebar-bottom">
              <AccountMenu basePath={basePath} />
            </div>
          </SheetContent>
        </Sheet>
      </header>
    </>
  );
}
