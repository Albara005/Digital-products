import { isTapChargeId, isTapEnabled, processTapCharge } from "@/lib/payments";

// Tap posts the charge here (charge.post.url). The body is untrusted: only its id is used, and the
// charge is re-fetched from Tap with the secret key before anything changes (processTapCharge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isTapEnabled()) {
    return Response.json({ error: "Tap غير مُعد على الخادم" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const id = body && typeof body === "object" ? (body as { id?: unknown }).id : undefined;
  if (typeof id !== "string" || !id) {
    return Response.json({ error: "معرّف العملية مفقود" }, { status: 400 });
  }
  if (!isTapChargeId(id)) {
    // Refund / authorize notifications and the like: nothing to do
    return Response.json({ received: true, ignored: true });
  }

  try {
    await processTapCharge(id);
  } catch (err) {
    // 500 lets Tap retry later; processing is idempotent
    console.error(`[tap] Failed to process webhook for ${id}`, err);
    return Response.json({ error: "تعذرت معالجة الحدث" }, { status: 500 });
  }
  return Response.json({ received: true });
}
