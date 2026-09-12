import { NextResponse } from "next/server";

export async function GET(request: Request) {
  return NextResponse.json({ users: [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  return NextResponse.json({ id: "1" });
}

export async function DELETE(request: Request) {
  return new Response(null, { status: 204 });
}
