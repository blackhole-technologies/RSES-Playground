/**
 * @file users-admin-page.tsx
 * @description Admin page for user management
 * @phase Phase 2 - User Management UI
 * @version 0.6.6
 * @created 2026-02-02
 */

import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { UserManagement } from "@/components/admin/users";
import { ArrowLeft, Users } from "lucide-react";

export default function UsersAdminPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  User Management
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage users, roles, and permissions
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <UserManagement />
      </main>
    </div>
  );
}
