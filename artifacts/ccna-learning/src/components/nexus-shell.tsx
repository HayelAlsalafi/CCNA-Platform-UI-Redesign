import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Network,
  LayoutDashboard,
  Target,
  History,
  BookOpen,
  ShieldCheck,
  Menu,
  ChevronLeft,
  Radio,
  UserRound,
} from "lucide-react";
import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  useHealthCheck,
} from "@workspace/api-client-react";
import { useNexusIdentity } from "../lib/nexus";
import { sessionQueryKey } from "../lib/learning-progress-cache";
import { AccountMenu } from "./application-navigation";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./ui/sheet";
import "../nexus.css";
const links = [
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/topics", label: "Learning Curriculum", icon: BookOpen },
  { href: "/practice", label: "Challenge Arena", icon: Target },
  { href: "/practice/history", label: "Learning Intelligence", icon: History },
  { href: "/profile", label: "Learner Profile", icon: UserRound },
];
function NexusSidebar({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const [path] = useLocation(),
    identity = useNexusIdentity(),
    user = useGetCurrentUser({
      query: {
        queryKey: sessionQueryKey(getGetCurrentUserQueryKey(), identity),
        enabled: !!identity,
        retry: false,
        gcTime: 0,
      },
    });
  return (
    <>
      <Link href="/" className="nexus-brand" onClick={onNavigate}>
        <Network size={30} />
        <span>
          CCNA <strong>NEXUS</strong>
          <small>NETWORK LEARNING SYSTEM</small>
        </span>
      </Link>
      <small className="nexus-nav-caption">YOUR LEARNING NETWORK</small>
      <nav aria-label="Learner navigation">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            href={href}
            key={href}
            className={path === href ? "is-current" : ""}
            aria-current={path === href ? "page" : undefined}
            title={compact ? label : undefined}
            onClick={onNavigate}
          >
            <Icon size={19} />
            <span>{label}</span>
          </Link>
        ))}
        <Link href="/exam" onClick={onNavigate}>
          <Target size={19} />
          <span>Exam Simulator</span>
        </Link>
        {user.data?.user.role === "ADMIN" && (
          <Link href="/admin" onClick={onNavigate}>
            <ShieldCheck size={19} />
            <span>Administration</span>
          </Link>
        )}
      </nav>
      <div className="nexus-sidebar-foot">
        <div className="nexus-network-label">
          <Radio size={16} />
          <span>Build skills. Connect ideas.</span>
        </div>
        <AccountMenu />
      </div>
    </>
  );
}
export function NexusAppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    health = useHealthCheck({ query: { queryKey: ["/api/healthz"], retry: false } });
  return (
    <div className={"nexus-app" + (collapsed ? " nexus-compact" : "")}>
      <a href="#nexus-content" className="nexus-skip">
        Skip to learning content
      </a>
      <aside className="nexus-sidebar">
        <NexusSidebar compact={collapsed} />
        <button
          className="nexus-collapse"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
        >
          <ChevronLeft size={16} />
        </button>
      </aside>
      <div className="nexus-body">
        <header className="nexus-topbar">
          <button
            className="nexus-mobile-menu"
            aria-label="Open learning navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={20} />
          </button>
          <span>
            CCNA 200-301 <strong>LEARNING WORKSPACE</strong>
          </span>
          <span className="nexus-status">
            <i className={health.isSuccess ? "available" : "unavailable"} />
            {health.isSuccess
              ? "API connected"
              : health.isPending
                ? "Checking API"
                : "API unavailable"}
          </span>
        </header>
        <main id="nexus-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <Sheet open={mobile} onOpenChange={setMobile}>
        <SheetContent side="left" className="nexus-mobile-sidebar">
          <SheetTitle className="sr-only">Learning navigation</SheetTitle>
          <SheetDescription className="sr-only">Choose a learning workspace.</SheetDescription>
          <NexusSidebar onNavigate={() => setMobile(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
