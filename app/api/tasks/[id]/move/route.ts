import { proxyTrackerRequest } from "@/src/lib/api/proxy";

export async function POST(request: Request) {
  return proxyTrackerRequest(request, "POST");
}
