import { Resend } from "npm:resend@4.0.0";
import { getCorsHeaders } from "../_shared/cors.ts";

interface FormData {
  bedrijf: string;
  contactpersoon: string;
  email: string;
  telefoon: string;
  concept: string;
  beschrijving: string;
  ruimte?: string;
  stroom?: string;
  social?: string;
}

function escapeHtml(str: unknown): string {
  if (str == null) return "";
  const s = String(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ ok: false, error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: FormData = await req.json();

    if (!body.bedrijf || !body.contactpersoon || !body.email || !body.telefoon || !body.concept || !body.beschrijving) {
      return new Response(
        JSON.stringify({ ok: false, error: "Vul alle verplichte velden in" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Ongeldig e-mailadres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ ok: false, error: "Email service niet beschikbaar" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(resendApiKey);

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    <div style="background: #0f172a; padding: 32px 24px; text-align: center;">
      <h1 style="color: #f59e0b; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 2px;">STAGENATION</h1>
      <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Nieuwe samenwerking aanvraag</p>
    </div>
    <div style="padding: 32px 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px; width: 140px; vertical-align: top;">Onderneming</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 600;">${escapeHtml(body.bedrijf)}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px; vertical-align: top;">Contactpersoon</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px;">${escapeHtml(body.contactpersoon)}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px; vertical-align: top;">E-mail</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px;"><a href="mailto:${escapeHtml(body.email)}" style="color: #0ea5e9;">${escapeHtml(body.email)}</a></td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px; vertical-align: top;">Telefoon</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px;">${escapeHtml(body.telefoon)}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px; vertical-align: top;">Type concept</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 600;">${escapeHtml(body.concept)}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px; vertical-align: top;">Beschrijving</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; white-space: pre-wrap;">${escapeHtml(body.beschrijving)}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px; vertical-align: top;">Benodigde ruimte</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px;">${escapeHtml(body.ruimte || "Niet opgegeven")}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px; vertical-align: top;">Stroomvereisten</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px;">${escapeHtml(body.stroom || "Niet opgegeven")}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; color: #64748b; font-size: 13px; vertical-align: top;">Social / Website</td>
          <td style="padding: 12px 0; color: #0f172a; font-size: 14px;">${escapeHtml(body.social || "Niet opgegeven")}</td>
        </tr>
      </table>
    </div>
    <div style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #94a3b8; margin: 0; font-size: 12px;">Dit bericht is verzonden via het samenwerkingsformulier op stagenation.be</p>
    </div>
  </div>
</body>
</html>`;

    const result = await resend.emails.send({
      from: "StageNation Samenwerking <samenwerking@stagenation.be>",
      to: ["samenwerking@stagenation.be"],
      reply_to: body.email,
      subject: `Samenwerking aanvraag: ${body.bedrijf} (${body.concept})`,
      html,
    });

    if (result?.error) {
      console.error("Resend error:", JSON.stringify(result.error));
      return new Response(
        JSON.stringify({ ok: false, error: "Verzending mislukt, probeer het later opnieuw" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ ok: false, error: "Er ging iets mis, probeer het later opnieuw" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
