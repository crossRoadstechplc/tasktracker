import { proxyTrackerRequest } from "@/src/lib/api/proxy";

export async function PATCH(request: Request) {
  return proxyTrackerRequest(request, "PATCH");
}

export async function DELETE(request: Request) {
  return proxyTrackerRequest(request, "DELETE");
}
