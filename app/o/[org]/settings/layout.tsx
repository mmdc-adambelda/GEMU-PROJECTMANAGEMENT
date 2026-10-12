import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: LayoutProps<"/o/[org]/settings">) {
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Organization settings</h1>
        <p className="text-sm text-muted-foreground">Manage your organization, people and workspaces.</p>
      </div>
      <SettingsNav />
      {children}
    </div>
  );
}
