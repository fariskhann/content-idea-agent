"use client";

import { Nav } from "@/components/Nav";
import { SettingsDialog } from "@/components/SettingsDialog";
import { UsageDialog } from "@/components/UsageDialog";
import { AboutTab } from "@/components/tabs/AboutTab";
import { GenerateTab } from "@/components/tabs/GenerateTab";
import { IdeasBoardTab } from "@/components/tabs/IdeasBoardTab";
import { FrameworksTab } from "@/components/tabs/FrameworksTab";
import { InspirationTab } from "@/components/tabs/InspirationTab";
import { useApp } from "@/lib/AppContext";

export function ContentIdeaAgent() {
  const app = useApp();

  if (!app.hydrated) return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-heading)", fontSize: 15, lineHeight: 1.55 }}>
      <Nav />
      <main style={{ flex: 1, padding: "48px 56px", overflowY: "auto", maxHeight: "100vh" }}>
        {app.activeTab === "brand" && <AboutTab />}
        {app.activeTab === "generate" && <GenerateTab />}
        {app.activeTab === "ideas" && <IdeasBoardTab />}
        {app.activeTab === "frameworks" && <FrameworksTab />}
        {app.activeTab === "inspiration" && <InspirationTab />}
      </main>
      <SettingsDialog />
      <UsageDialog />
    </div>
  );
}
