import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json()) as HandleUploadBody

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/zip", "application/octet-stream", "application/x-zip-compressed"],
        maximumSizeInBytes: 250 * 1024 * 1024, // 250 MB max
      }),
      onUploadCompleted: async () => {
        // no-op: we process after client notifies us separately
      },
    })
    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 })
  }
}
