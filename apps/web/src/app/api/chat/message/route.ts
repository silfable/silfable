/* eslint-disable */
// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { cloudDb, isDbConfigured } from "@/lib/cloud-db";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";

function isValidObjectId(id?: string): boolean {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}

export async function GET(req: NextRequest) {
  if (!isDbConfigured) {
    return NextResponse.json({ messages: [] });
  }
  try {
    const auth = await requireWalletAuth(req);
    if (isAuthFailure(auth)) return auth;
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId || !isValidObjectId(sessionId)) {
      return NextResponse.json({ messages: [] });
    }

    const ownedSession = await cloudDb.chatSession.findFirst({
      where: { id: sessionId, userId: auth.userId },
      select: { id: true },
    });
    if (!ownedSession) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    const messages = await cloudDb.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });

    const formatted = messages.map((m) => ({
      id: m.id,
      sessionId: m.sessionId,
      role: m.role,
      content: m.content,
      proposal: m.proposalJson ? JSON.parse(m.proposalJson) : undefined,
      usage: m.usageJson ? JSON.parse(m.usageJson) : undefined,
      createdAt: m.createdAt.getTime(),
    }));

    return NextResponse.json({ messages: formatted });
  } catch (error) {
    console.error("GET /api/chat/message error:", error);
    return NextResponse.json({ error: "Failed to fetch chat messages" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireWalletAuth(req);
    if (isAuthFailure(auth)) return auth;
    const body = await req.json();
    const { message } = body;

    if (!message || !message.sessionId || !isValidObjectId(message.sessionId) || !message.role || !message.content) {
      return NextResponse.json({ error: "Invalid message payload or sessionId" }, { status: 400 });
    }
    const ownedSession = await cloudDb.chatSession.findFirst({
      where: { id: message.sessionId, userId: auth.userId },
      select: { id: true },
    });
    if (!ownedSession) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    let saved;
    if (isValidObjectId(message.id)) {
      const existing = await cloudDb.chatMessage.findFirst({
        where: { id: message.id, sessionId: message.sessionId },
      });
      if (existing) {
        saved = await cloudDb.chatMessage.update({
          where: { id: existing.id },
          data: {
            content: message.content,
            proposalJson: message.proposal ? JSON.stringify(message.proposal) : null,
            usageJson: message.usage ? JSON.stringify(message.usage) : null,
          },
        });
      }
    }

    if (!saved) {
      saved = await cloudDb.chatMessage.create({
        data: {
          sessionId: message.sessionId,
          role: message.role,
          content: message.content,
          proposalJson: message.proposal ? JSON.stringify(message.proposal) : null,
          usageJson: message.usage ? JSON.stringify(message.usage) : null,
        },
      });
    }

    // Touch parent session's updatedAt timestamp
    await cloudDb.chatSession.update({
      where: { id: message.sessionId },
      data: { updatedAt: new Date() },
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      message: {
        id: saved.id,
        sessionId: saved.sessionId,
        role: saved.role,
        content: saved.content,
        proposal: saved.proposalJson ? JSON.parse(saved.proposalJson) : undefined,
        usage: saved.usageJson ? JSON.parse(saved.usageJson) : undefined,
        createdAt: saved.createdAt.getTime(),
      },
    });
  } catch (error) {
    console.error("POST /api/chat/message error:", error);
    return NextResponse.json({ error: "Failed to save chat message" }, { status: 500 });
  }
}
