-- Additive only: revision column + event log for SSE catch-up
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "WorkspaceEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "payload" JSONB NOT NULL,
    "actorUserId" TEXT,
    "actorClientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorkspaceEvent_workspaceId_revision_idx" ON "WorkspaceEvent"("workspaceId", "revision");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceEvent_workspaceId_fkey'
  ) THEN
    ALTER TABLE "WorkspaceEvent" ADD CONSTRAINT "WorkspaceEvent_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
