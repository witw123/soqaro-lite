import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardViewSource = readFileSync(new URL("./RoomDashboardView.tsx", import.meta.url), "utf8");
const libraryPanelSource = readFileSync(new URL("./LibraryTabPanel.tsx", import.meta.url), "utf8");
const searchPanelSource = readFileSync(new URL("./SearchTabPanel.tsx", import.meta.url), "utf8");

describe("RoomDashboardView 4-tab panel structure", () => {
  it("defines 4 management tabs including search", () => {
    expect(dashboardViewSource).toContain('type ManagementTabId = "library" | "search" | "local" | "members";');
    expect(dashboardViewSource).toContain('{ id: "library", label: "曲库", icon: MusicIcon }');
    expect(dashboardViewSource).toContain('{ id: "search", label: "搜索", icon: SearchIcon }');
    expect(dashboardViewSource).toContain('{ id: "local", label: "我的歌单", icon: RadioIcon }');
    expect(dashboardViewSource).toContain('{ id: "members", label: "成员", icon: UsersIcon }');
  });

  it("dynamically imports and preloads SearchTabPanel", () => {
    expect(dashboardViewSource).toContain('dynamic(() => import("./SearchTabPanel")');
    expect(dashboardViewSource).toContain('() => import("./SearchTabPanel")');
  });

  it("renders SearchTabPanel when activeTab is search", () => {
    expect(dashboardViewSource).toContain('if (props.activeTab === "search")');
    expect(dashboardViewSource).toContain("<SearchTabPanel");
  });

  it("removes showProviderSearch from LibraryTabPanel completely", () => {
    expect(libraryPanelSource).not.toContain("showProviderSearch");
    expect(libraryPanelSource).not.toContain("RoomProviderTrackSearch");
    expect(dashboardViewSource).not.toContain("showProviderSearch");
  });

  it("renders RoomProviderTrackSearch in SearchTabPanel with import mode", () => {
    expect(searchPanelSource).toContain("<RoomProviderTrackSearch");
    expect(searchPanelSource).toContain('mode="import"');
    expect(searchPanelSource).toContain('data-testid="room-search-tab-panel"');
  });
});
