import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireSession } from "@/src/lib/api/guard";
import { jsonWithSession, workspaceRevisionHeaders } from "@/src/lib/api/response";
import { getActorClientId, serviceErrorResponse } from "@/src/lib/api/route-helpers";
import { createTask } from "@/src/lib/workspace/services/tasks";

const createSchema = z.object({
  title: z.string().trim().min(1),
  team: z.string().trim().min(1),
  description: z.string().optional(),
  priority: z.string().optional(),
  due: z.string().optional(),
  status: z.enum(["To Do", "In Progress", "Done"]).optional(),
  owners: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  const sessionResult = await requireSession();
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  const allowed = await requirePermission(session.auth, "tasks.create");
  if ("error" in allowed) return allowed.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid task payload." }, { status: 400 });
  }

  try {
    const result = await createTask({
      actor: {
        userId: session.auth.user.id,
        clientId: getActorClientId(request),
      },
      ...parsed.data,
    });

    return jsonWithSession(
      { task: result.task, revision: result.revision },
      {
        auth: session.auth,
        payload: session.payload,
        hadValidAccess: session.hadValidAccess,
        headers: workspaceRevisionHeaders(result.revision),
      },
    );
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
