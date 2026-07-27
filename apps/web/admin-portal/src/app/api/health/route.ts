import { NextResponse } from 'next/server';

// Liveness/readiness probe target — mirrors the /health contract every NAFA
// service exposes, so the shared Helm chart works for web apps too.
export function GET() {
  return NextResponse.json({ status: 'ok' });
}
